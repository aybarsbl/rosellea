import time
from typing import Callable, Optional
from funcs import threads


# ADS1115 + MQ-2: I2C üzerinden okuma. Hardware import'u failsafe — Pi dışında
# (Windows dev makinesinde) import patlamasın diye try/except. Donanım yoksa
# Smoke.start() no-op olur ve None okuma döner.
try:
    import board  # type: ignore
    import busio  # type: ignore
    import adafruit_ads1x15.ads1115 as ADS  # type: ignore
    from adafruit_ads1x15.analog_in import AnalogIn  # type: ignore
    _HARDWARE_OK = True
    _HARDWARE_ERR: Optional[str] = None
except Exception as e:  # ImportError on dev, RuntimeError on missing /dev/i2c
    _HARDWARE_OK = False
    _HARDWARE_ERR = repr(e)


class Smoke:
    def __init__(
        self,
        on_detected: Callable[[int], None],
        threshold: int = 18000,
        debounce_samples: int = 3,
        poll_hz: float = 5.0,
        i2c_address: int = 0x48,
        adc_channel: int = 0,
    ):
        self._on_detected = on_detected
        self._threshold = int(threshold)
        self._debounce_samples = max(1, int(debounce_samples))
        self._interval = max(0.02, 1.0 / max(0.1, float(poll_hz)))
        self._i2c_address = int(i2c_address)
        self._adc_channel = int(adc_channel)

        self._chan = None
        self._ads = None
        self._i2c = None
        self._last_value: Optional[int] = None
        self._over = 0
        self._fired_recently = False

        self._thread = threads.Thread(name="Smoke", loop_func=self._loop)

    def _open(self) -> bool:
        if not _HARDWARE_OK:
            print(f"[Smoke] hardware desteklenmiyor ({_HARDWARE_ERR}); izleyici devre dışı.")
            return False
        try:
            self._i2c = busio.I2C(board.SCL, board.SDA)
            self._ads = ADS.ADS1115(self._i2c, address=self._i2c_address)
            pins = (ADS.P0, ADS.P1, ADS.P2, ADS.P3)
            self._chan = AnalogIn(self._ads, pins[self._adc_channel])
            return True
        except Exception as e:
            print(f"[Smoke] ADS1115 açılamadı: {e}")
            self._chan = None
            self._ads = None
            self._i2c = None
            return False

    def _loop(self):
        while self._thread.running.is_set():
            try:
                raw = int(self._chan.value)
            except Exception as e:
                print(f"[Smoke] okuma hatası: {e}")
                time.sleep(self._interval)
                continue

            self._last_value = raw

            if raw >= self._threshold:
                self._over += 1
                if (
                    self._over >= self._debounce_samples
                    and not self._fired_recently
                ):
                    self._fired_recently = True
                    try:
                        self._on_detected(raw)
                    except Exception as e:
                        print(f"[Smoke] callback hatası: {e}")
            else:
                self._over = 0
                # Yangın atlatıldıktan sonra tekrar yangın tetikleyebilmek için
                # eşik altına düşünce reset.
                self._fired_recently = False

            time.sleep(self._interval)

    def start(self):
        if not self._open():
            return
        self._thread.open()

    def stop(self):
        self._thread.close()

    def current(self) -> Optional[int]:
        return self._last_value

    @property
    def threshold(self) -> int:
        return self._threshold

    @property
    def enabled(self) -> bool:
        return _HARDWARE_OK and self._chan is not None
