import argparse
import asyncio
import json
import os
import tempfile

import edge_tts
from groq import Groq


os.environ.setdefault("PYGAME_HIDE_SUPPORT_PROMPT", "1")
VOICE = "pt-BR-FranciscaNeural"
MODEL = "llama-3.1-8b-instant"


def local_reply(message: str) -> str:
    normalized = message.lower()
    if "calcular" in normalized or "conta" in normalized:
        return "Manda os valores nos campos principais e aperta calcular. Depois eu te ajudo a salvar a conta."
    if "voz" in normalized or "microfone" in normalized:
        return "Estou usando minha voz neural local por aqui. Se eu nao falar, confere o volume e a permissao de audio."
    if "cliente" in normalized:
        return "Clientes ficam em configuracoes, na area de clientes. Depois voce vincula eles na conta."
    return "Estou te ouvindo. A ponte de voz ja esta funcionando, chefe."


def ask_groq(message: str) -> str:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return local_reply(message)

    client = Groq(api_key=api_key)
    completion = client.chat.completions.create(
        model=MODEL,
        messages=[
            {
                "role": "system",
                "content": "Voce e a L.I.L.Y., uma assistente brasileira. Responda curto, util e com linguagem natural.",
            },
            {"role": "user", "content": message},
        ],
        temperature=0.7,
        max_tokens=150,
    )
    return completion.choices[0].message.content or local_reply(message)


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
        reply = ask_groq(args.message)
        if args.speak:
            await speak(reply)
        print(json.dumps({"reply": reply}, ensure_ascii=False))
    except Exception as error:
        fallback = f"Tive um erro ao responder: {error}"
        print(json.dumps({"reply": fallback}, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
