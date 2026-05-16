import json
import queue
import threading
import time
from typing import Any, Optional

from funcs import database, env as env_mod, microphone, speaker


# Emergency state machine + SSE broker. Smoke thread'i trigger(), Mic _loop'u
# cancel("voice"), HTTP /emergency/cancel ise cancel("app") çağırır. Tüm public
# yöntemler thread-safe (tek mutex).
class EmergencyManager:
    STATE_IDLE = "idle"
    STATE_ARMED = "armed"
    STATE_CANCELLED = "cancelled"
    STATE_FIRED = "fired"
    STATE_SENT = "sent"

    def __init__(
        self,
        speaker: speaker.Speaker,
        mic: microphone.Microphone,
        env: env_mod.Environment,
        messages: Optional[database.Messages] = None,
        countdown_s: int = 10,
    ):
        self._speaker = speaker
        self._mic = mic
        self._env = env
        self._messages = messages
        self._countdown_s = max(1, int(countdown_s))

        self._lock = threading.Lock()
        self._state: str = self.STATE_IDLE
        self._raw: int = 0
        self._source: str = "smoke"
        self._started_at: float = 0.0
        self._fired_at: float = 0.0
        self._sent_count: int = 0
        self._timer: Optional[threading.Timer] = None
        self._announce_thread: Optional[threading.Thread] = None

        self._subscribers: set[queue.Queue] = set()
        self._sub_lock = threading.Lock()

        # Mic backend'i her transkript sonrası cancel mode aktifse bizim
        # callback'i çağıracak.
        self._mic.set_cancel_listener(self._on_voice_cancel)

    @property
    def state(self) -> str:
        return self._state

    def snapshot(self) -> dict:
        with self._lock:
            return {
                "state": self._state,
                "raw": self._raw,
                "source": self._source,
                "threshold": int(self._env.get("safety.smoke.threshold") or 0),
                "started_at": self._started_at,
                "fired_at": self._fired_at,
                "countdown_s": self._countdown_s,
                "sent_count": self._sent_count,
            }

    def trigger(self, raw_value: int, source: str = "smoke"):
        with self._lock:
            if self._state in (self.STATE_ARMED, self.STATE_FIRED):
                return
            self._state = self.STATE_ARMED
            self._raw = int(raw_value)
            self._source = str(source) or "smoke"
            self._started_at = time.time()
            self._fired_at = 0.0
            self._sent_count = 0
            countdown = self._countdown_s
            current_source = self._source

        if current_source == "heart_rate":
            self._log(
                f"[Acil Durum] Kalp ritmi anomalisi (hr={raw_value}). Geri sayım başladı."
            )
        else:
            self._log(
                f"[Acil Durum] Duman algılandı (raw={raw_value}). Geri sayım başladı."
            )
        self._publish({
            "type": "emergency.armed",
            "raw": raw_value,
            "source": current_source,
            "countdown_s": countdown,
            "started_at": self._started_at,
        })

        # Anonsu ayrı thread'de yap: Speaker.speak() bloklayıcı ve istemiyoruz ki
        # trigger() çağıran Smoke thread'i konuşma bitene kadar takılı kalsın.
        self._announce_thread = threading.Thread(
            target=self._announce_and_arm_timer,
            name="EmergencyAnnounce",
            daemon=True,
        )
        self._announce_thread.start()

    def _announce_and_arm_timer(self):
        countdown = self._countdown_s
        text = (
            f"Acil durum algılanmıştır. "
            f"İptal etmek için 'İptal' demeniz yeterlidir. "
            f"{countdown} saniyeniz var."
        )
        try:
            self._speaker.speak(text)
        except Exception as e:
            print(f"[Emergency] anons hatası: {e}")

        # State değişmiş olabilir (frontend hızlıca cancel basmış olabilir).
        with self._lock:
            if self._state != self.STATE_ARMED:
                return
            # Anonsta geçen süreyi sayım dışı tutuyoruz — kullanıcının duyduktan
            # sonra 10 saniyesi olsun. Timer'ı şimdi başlat.
            self._started_at = time.time()
            self._timer = threading.Timer(countdown, self._on_timeout)
            self._timer.daemon = True
            self._timer.start()

        # Mic'i iptal modunda dinlemeye al — her transkriptte "iptal" geçerse
        # _on_voice_cancel tetiklenecek.
        self._mic.set_cancel_mode(True)

        # Frontend countdown sync için anons sonrası tazelenmiş started_at'i bildir.
        self._publish({
            "type": "emergency.armed",
            "raw": self._raw,
            "source": self._source,
            "countdown_s": countdown,
            "started_at": self._started_at,
            "phase": "after_announce",
        })

    def _on_voice_cancel(self):
        self.cancel("voice")

    def cancel(self, source: str = "app"):
        with self._lock:
            if self._state != self.STATE_ARMED:
                return
            self._state = self.STATE_CANCELLED
            if self._timer is not None:
                self._timer.cancel()
                self._timer = None

        self._mic.set_cancel_mode(False)
        self._log(f"[Acil Durum] İptal edildi (kaynak={source}).")
        self._publish({
            "type": "emergency.cancelled",
            "source": source,
            "at": time.time(),
        })
        # Kısa beklemeden sonra idle'a dön.
        threading.Timer(2.0, self._reset_to_idle).start()

    def _on_timeout(self):
        with self._lock:
            if self._state != self.STATE_ARMED:
                return
            self._state = self.STATE_FIRED
            self._fired_at = time.time()
            self._timer = None

        self._mic.set_cancel_mode(False)
        self._log("[Acil Durum] Geri sayım bitti, yetkililer aranıyor.")
        self._publish({
            "type": "emergency.fired",
            "fired_at": self._fired_at,
        })

    def mark_sent(self, count: int):
        with self._lock:
            if self._state not in (self.STATE_FIRED, self.STATE_SENT):
                return False
            self._state = self.STATE_SENT
            self._sent_count = max(self._sent_count, int(count))

        self._log(f"[Acil Durum] {count} kişiye SMS gönderildi.")
        self._publish({
            "type": "emergency.sent",
            "count": count,
            "at": time.time(),
        })
        # SMS gönderildikten sonra otomatik temizleme — kullanıcı/teknisyen
        # tekrar manuel kontrol etmek isteyebilir, biraz daha bekleyelim.
        threading.Timer(5.0, self._reset_to_idle).start()
        return True

    def _reset_to_idle(self):
        with self._lock:
            self._state = self.STATE_IDLE
            self._raw = 0
            self._source = "smoke"
            self._started_at = 0.0
            self._fired_at = 0.0
            self._sent_count = 0
        self._publish({"type": "emergency.idle", "at": time.time()})

    def _log(self, text: str):
        print(text)
        if self._messages is not None:
            try:
                self._messages.insert("assistant", text, speak=False)
            except Exception as e:
                print(f"[Emergency] log insert hatası: {e}")

    # ---- SSE broker ----
    def subscribe(self) -> queue.Queue:
        q: queue.Queue = queue.Queue(maxsize=64)
        with self._sub_lock:
            self._subscribers.add(q)
        # İlk bağlantıda anlık snapshot gönder ki frontend modal state'i bilsin.
        try:
            q.put_nowait({
                "type": "emergency.snapshot",
                **self.snapshot(),
            })
        except queue.Full:
            pass
        return q

    def unsubscribe(self, q: queue.Queue):
        with self._sub_lock:
            self._subscribers.discard(q)

    def _publish(self, event: dict[str, Any]):
        event = dict(event)
        event.setdefault("ts", time.time())
        with self._sub_lock:
            targets = list(self._subscribers)
        for q in targets:
            try:
                q.put_nowait(event)
            except queue.Full:
                # Yavaş tüketici varsa son event'i kaybetmektense en eski'yi at.
                try:
                    q.get_nowait()
                    q.put_nowait(event)
                except Exception:
                    pass

    @staticmethod
    def format_sse(event: dict) -> bytes:
        return f"data: {json.dumps(event, ensure_ascii=False)}\n\n".encode("utf-8")
