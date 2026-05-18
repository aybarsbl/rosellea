import re
from time import perf_counter
from typing import Callable
from openai import OpenAI
from funcs import tools


# Cümle sonu işareti + opsiyonel tırnak/parantez kuyruğu, ardından boşluk
# ya da chunk sonu. `[.!?…]+` ardışık birden fazla işareti tek boundary
# olarak yakalar (Türkçe "..." veya "…" için).
_SENTENCE_END_RE = re.compile(r"([.!?…]+[\"'»)\]]*)(\s|$)")
# Cümle sonu sayılmayacak yaygın Türkçe kısaltmalar — splitter bu
# token'lardan sonra geleni atlar, böylece "Dr. Ahmet" tek cümle kalır.
_ABBREVS = {"dr", "sn", "bay", "bn", "vb", "vs", "bkz", "no", "prof", "av", "ör"}
_MIN_SENTENCE_LEN = 8


class _SentenceSplitter:
    """LLM stream chunk'larını biriktirip tamamlanmış Türkçe cümleleri
    yield eden incremental parser. tool_call path'inde bypass edilir."""

    def __init__(self):
        self._buf = ""

    def feed(self, chunk: str) -> list[str]:
        if not chunk:
            return []
        self._buf += chunk
        out: list[str] = []
        while True:
            m = _SENTENCE_END_RE.search(self._buf)
            if not m:
                break
            end = m.end(1)  # punctuation kuyruğunun bitişi
            before_punct = m.start(1) - 1
            # Sayı içinde nokta? (3.14, 15.30) — boundary değil, ilerle.
            if before_punct >= 0 and self._buf[before_punct].isdigit():
                # Bu boundary'i atlayıp sonraki arama için buf'u kırpmak
                # yerine, search'ü ileri kaydır: punctuation sonrası
                # devam etsin.
                if not self._advance_past(end):
                    break
                continue
            # Kısaltma kontrolü: punctuation'dan önceki kelimeyi al.
            if before_punct >= 0:
                word_start = before_punct
                while word_start > 0 and self._buf[word_start - 1].isalpha():
                    word_start -= 1
                word = self._buf[word_start:before_punct + 1].lower()
                if word in _ABBREVS:
                    if not self._advance_past(end):
                        break
                    continue
            sentence = self._buf[:end].strip()
            self._buf = self._buf[end:].lstrip()
            if len(sentence) >= _MIN_SENTENCE_LEN:
                out.append(sentence)
            # Çok kısa segment varsa buf'a geri katma — drop et (tek
            # işaret veya "Ok." gibi gürültü cümle olmasın).
        return out

    def _advance_past(self, idx: int) -> bool:
        """Geçici buffer trick'i: bulunan boundary geçersizse onu sahte
        karakter (boşluk) yaparak ileri arama yapabilelim."""
        if idx <= 0 or idx > len(self._buf):
            return False
        self._buf = self._buf[:idx - 1] + " " + self._buf[idx:]
        return True

    def flush(self) -> str:
        rest = self._buf.strip()
        self._buf = ""
        return rest if len(rest) >= _MIN_SENTENCE_LEN else ""


class LLM:
    def __init__(
        self,
        gpt: OpenAI,
        gpt_model: str,
        tools: tools.Tools,
    ):
        self._gpt = gpt
        self._gpt_model = gpt_model
        self._tools = tools

    def chat(
        self,
        messages: list = [],
        on_sentence: Callable[[str], None] | None = None,
    ) -> str | None:
        tools = self._tools.get() if isinstance(self._tools.get(), list) else []

        answer = ""
        tool_calls: dict[int, dict] = {}
        tool_calls_seen = False
        splitter = _SentenceSplitter() if on_sentence else None

        t_start = perf_counter()
        t_first_token: float | None = None
        t_first_sentence: float | None = None

        stream = self._gpt.chat.completions.create(
            model=self._gpt_model,
            messages=messages,
            tools=tools,
            tool_choice="auto",
            stream=True,
        )
        for chunk in stream:
            delta = chunk.choices[0].delta

            if delta.content:
                if t_first_token is None:
                    t_first_token = perf_counter()
                answer += delta.content
                # Tool çağrısı içeren akışta on_sentence çağırma — tool
                # cevabı sonradan tek seferde söylenir (eski yol).
                if splitter and not tool_calls_seen:
                    for sentence in splitter.feed(delta.content):
                        if t_first_sentence is None:
                            t_first_sentence = perf_counter()
                            print(
                                f"[perf] llm_first_token_ms="
                                f"{(t_first_token-t_start)*1000:.0f} "
                                f"llm_first_sentence_ms="
                                f"{(t_first_sentence-t_start)*1000:.0f}"
                            )
                        on_sentence(sentence)

            if delta.tool_calls:
                tool_calls_seen = True
                for tc in delta.tool_calls:
                    idx = tc.index

                    if idx not in tool_calls:
                        tool_calls[idx] = {"name": "", "arguments": ""}

                    if tc.function.name:
                        tool_calls[idx]["name"] = tc.function.name

                    if tc.function.arguments:
                        tool_calls[idx]["arguments"] += tc.function.arguments

        # Stream bitiminde tampon kalmışsa son cümleyi yolla.
        if splitter and not tool_calls_seen:
            tail = splitter.flush()
            if tail and on_sentence:
                on_sentence(tail)

        total_ms = (perf_counter() - t_start) * 1000
        if not tool_calls_seen:
            print(f"[perf] llm_total_ms={total_ms:.0f}")
        else:
            print(f"[perf] llm_total_ms={total_ms:.0f} (tool_call)")

        if tool_calls:
            return self._tools.call(tool_calls=tool_calls)
        else:
            return answer
