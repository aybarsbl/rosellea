from openai import OpenAI
from funcs import tools


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

    def chat(self, messages: list = []) -> str | None:
        tools = self._tools.get() if isinstance(self._tools.get(), list) else []

        answer = ""
        tool_calls: dict[int, dict] = {}

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
                answer += delta.content

            if delta.tool_calls:
                for tc in delta.tool_calls:
                    idx = tc.index

                    if idx not in tool_calls:
                        tool_calls[idx] = {"name": "", "arguments": ""}

                    if tc.function.name:
                        tool_calls[idx]["name"] = tc.function.name

                    if tc.function.arguments:
                        tool_calls[idx]["arguments"] += tc.function.arguments

        if tool_calls:
            return self._tools.call(tool_calls=tool_calls)
        else:
            return answer
