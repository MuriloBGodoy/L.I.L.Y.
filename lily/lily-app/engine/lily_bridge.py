import argparse
import asyncio
import json
import os
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional

import edge_tts


os.environ.setdefault("PYGAME_HIDE_SUPPORT_PROMPT", "1")
GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
LILY_SYSTEM_PROMPT = (
    "Voce e a L.I.L.Y., uma assistente brasileira, esperta e prestativa. "
    "Converse sobre qualquer assunto e responda perguntas gerais normalmente. "
    "Voce tambem conhece o app do chefe (calculos, clientes e contas de servicos) "
    "e ajuda com ele quando o assunto vier. "
    "Quando nao souber algo especifico do app, seja honesta e sugira o proximo passo "
    "em vez de inventar telas ou botoes. "
    "Responda curto, util, natural e em pt-BR. Nunca diga que so fala sobre o app."
)


def load_env_file() -> None:
    env_paths = [
        Path(__file__).resolve().parents[1] / ".env",
        Path(__file__).resolve().parent / ".env",
    ]

    for env_path in env_paths:
        if not env_path.exists():
            continue

        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and value:
                os.environ.setdefault(key, value)


load_env_file()


VOICE = os.getenv("LILY_VOICE", "pt-BR-FranciscaNeural")
GROQ_MODEL = os.getenv("GROQ_MODEL", "groq/compound-mini")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")


def local_reply(message: str) -> str:
    normalized = message.lower()
    if "calcular" in normalized or "conta" in normalized:
        return "Manda os valores nos campos principais e aperta calcular. Depois eu te ajudo a salvar a conta."
    if "voz" in normalized or "microfone" in normalized:
        return "Estou usando minha voz neural local por aqui. Se eu nao falar, confere o volume e a permissao de audio."
    if "cliente" in normalized:
        return "Clientes ficam em configuracoes, na area de clientes. Depois voce vincula eles na conta."
    return "Estou te ouvindo. A ponte de voz ja esta funcionando, chefe."


# Termos de busca vao para o Groq: o modelo compound pesquisa na web sozinho,
# enquanto o Gemini responde so pelo treinamento (google_search bloqueado na chave atual).
SEARCH_TRIGGERS = (
    "pesquisa",
    "pesquisar",
    "buscar",
    "busca",
    "procura",
    "procurar",
)


def needs_web_search(message: str) -> bool:
    normalized = message.lower()
    return any(trigger in normalized for trigger in SEARCH_TRIGGERS)


def should_use_gemini(message: str) -> bool:
    normalized = message.lower()
    if needs_web_search(normalized):
        return False

    complex_triggers = (
        "analisa",
        "analisar",
        "explica",
        "explicar",
        "comparar",
        "compara",
        "melhor",
        "estrategia",
        "planeja",
        "planejar",
        "resuma",
        "resumir",
        "detalhe",
        "detalhar",
        "por que",
        "porque",
        "como funciona",
    )
    return len(normalized) > 120 or any(trigger in normalized for trigger in complex_triggers)


def ask_groq(
    message: str,
    system_prompt: str = LILY_SYSTEM_PROMPT,
    max_tokens: int = 180,
) -> Optional[str]:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return None

    from groq import Groq

    client = Groq(api_key=api_key)
    completion = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {
                "role": "system",
                "content": system_prompt,
            },
            {"role": "user", "content": message},
        ],
        temperature=0.7,
        max_tokens=max_tokens,
    )
    return completion.choices[0].message.content


def ask_gemini(message: str) -> Optional[str]:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None

    payload = {
        "systemInstruction": {
            "parts": [{"text": LILY_SYSTEM_PROMPT}],
        },
        "contents": [
            {
                "role": "user",
                "parts": [{"text": message}],
            }
        ],
        "generationConfig": {
            "temperature": 0.55,
            "maxOutputTokens": 360,
        },
    }
    url = GEMINI_ENDPOINT.format(model=GEMINI_MODEL)
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        },
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=25) as response:
        data = json.loads(response.read().decode("utf-8"))

    parts = (
        data.get("candidates", [{}])[0]
        .get("content", {})
        .get("parts", [])
    )
    text = "".join(part.get("text", "") for part in parts).strip()
    return text or None


def polish_with_groq(message: str, gemini_context: str) -> str:
    prompt = (
        "Use o contexto abaixo para responder ao usuario como L.I.L.Y. "
        "Mantenha em ate 3 frases, natural, sem mencionar Gemini ou Groq.\n\n"
        f"Pergunta do usuario: {message}\n\n"
        f"Contexto:\n{gemini_context}"
    )
    return ask_groq(prompt, LILY_SYSTEM_PROMPT, max_tokens=170) or gemini_context


def ask_lily(message: str) -> str:
    try:
        if should_use_gemini(message):
            gemini_reply = ask_gemini(message)
            if gemini_reply:
                return polish_with_groq(message, gemini_reply)

        groq_reply = ask_groq(message)
        if groq_reply:
            return groq_reply

        gemini_reply = ask_gemini(message)
        if gemini_reply:
            return gemini_reply
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as error:
        groq_reply = ask_groq(
            f"O usuario perguntou: {message}\nA busca com Gemini falhou: {error}. Responda com fallback util.",
            max_tokens=150,
        )
        if groq_reply:
            return groq_reply
    except Exception as error:
        return f"Tive um erro ao acessar meu cerebro: {error}"

    return local_reply(message)


async def speak(text: str) -> None:
    import pygame

    output_file = os.path.join(tempfile.gettempdir(), "lily_reply.mp3")
    communicate = edge_tts.Communicate(text, VOICE)
    await communicate.save(output_file)

    pygame.mixer.init()
    pygame.mixer.music.load(output_file)
    pygame.mixer.music.play()
    while pygame.mixer.music.get_busy():
        await asyncio.sleep(0.05)
    pygame.mixer.quit()


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--message", required=True)
    parser.add_argument("--speak", action="store_true")
    args = parser.parse_args()

    try:
        reply = ask_lily(args.message)
        if args.speak:
            await speak(reply)
        print(json.dumps({"reply": reply}, ensure_ascii=False))
    except Exception as error:
        fallback = f"Tive um erro ao responder: {error}"
        print(json.dumps({"reply": fallback}, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
