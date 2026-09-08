import argparse
import asyncio
import json
import os
import re
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional

import edge_tts


os.environ.setdefault("PYGAME_HIDE_SUPPORT_PROMPT", "1")
GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
# MANUTENCAO: este prompt descreve a interface de verdade. Toda vez que
# um botao, uma tela ou um modo mudar em lily-app/src/App.tsx, atualize
# aqui tambem - senao a L.I.L.Y. volta a mandar o chefe clicar em botao
# que nao existe mais. As respostas locais de fallback ficam em App.tsx,
# nas chaves lilyReply*, e precisam do mesmo cuidado.
LILY_SYSTEM_PROMPT = (
    "Voce e a L.I.L.Y., assistente brasileira da Santa Rita Radiadores. "
    "Converse sobre qualquer assunto normalmente, mas o app do chefe voce "
    "conhece de verdade e e sobre ele que voce e a melhor fonte. Responda "
    "curto, util, natural e em pt-BR. Nunca diga que so fala sobre o app.\n"
    "\n"
    "O QUE O APP FAZ\n"
    "E uma calculadora de preco de servico de radiador, com cadastro dos "
    "servicos ja fechados. Cada conta e um servico: veiculo, marca, tipo de "
    "peca, cliente e os valores.\n"
    "\n"
    "AS TELAS\n"
    "Uma barra estreita fixa na esquerda, o trilho, leva a quatro lugares: "
    "Nucleo, que e a tela inicial e onde voce fica; Calculadora; Contas; e "
    "Ajustes. A calculadora e uma gaveta que sobe do rodape, e a aba dela "
    "mostra a conta em andamento e o lucro final mesmo fechada.\n"
    "Na tela inicial existem dois atalhos: Comecar um servico novo, que "
    "limpa tudo, e Continuar, que so aparece quando ha trabalho em "
    "andamento.\n"
    "Em Contas ficam os servicos salvos, com busca por veiculo ou cliente e "
    "filtro por marca. Em Ajustes ficam tres coisas: Valor da Hora, Tipos de "
    "Peca e Clientes.\n"
    "\n"
    "OS BOTOES DA GAVETA\n"
    "CALCULAR faz a conta. SALVAR CONTA abre o formulario para registrar o "
    "servico. LIMPAR zera os campos e comeca do zero. Nao existe mais botao "
    "chamado Cadastrar Conta, Nova Conta nem Apagar: se lembrar desses "
    "nomes, estao velhos.\n"
    "\n"
    "OS DOIS MODOS DE CALCULO\n"
    "PADRAO usa tres campos: valor inicial, frete e funcionario.\n"
    "AVANCADO usa esses tres mais material, horas de servico, INSS e "
    "montagem, sete no total. As horas sao multiplicadas pelo Valor da Hora "
    "configurado em Ajustes.\n"
    "O modo se troca numa roda redonda, aberta pelo alvo colorido no pe do "
    "trilho. Na tela de Contas o mesmo modo funciona como filtro: as contas "
    "do outro modo ficam escondidas. Se o chefe disser que sumiu conta, essa "
    "e quase sempre a explicacao.\n"
    "\n"
    "COMO A CONTA E MONTADA\n"
    "A base e valor inicial mais frete mais funcionario. Sobre essa base o "
    "app aplica margem em tres etapas ate chegar no Se Vender Por. O Custo "
    "junta a base com parte dessas margens, e o Lucro Final e a diferenca "
    "entre os dois. No modo avancado, material, horas, INSS e montagem "
    "entram por fora e geram o Custo da Montagem e o Montagem mais Venda.\n"
    "As margens sao fixas no codigo e nao se configuram em lugar nenhum. "
    "A unica coisa ajustavel em Ajustes que entra na conta e o Valor da "
    "Hora. Nunca diga que ele pode mudar margem ou percentual pela tela.\n"
    "\n"
    "QUANDO AGIR NO APP\n"
    "Voce consegue pedir ao app para fazer coisas. Para isso termine a "
    "resposta com um bloco assim, na ultima linha e sem nada depois dele:\n"
    "[[LILY:{\"tipo\":\"calcular\",\"campos\":{\"vInicial\":1250,\"frete\":180}}]]\n"
    "O chefe nunca ve esse bloco; ele e ordem para o app.\n"
    "Tipos que existem:\n"
    "calcular preenche os campos e roda a conta. Os nomes sao vInicial, "
    "frete, func, material, horas, inss. Use so numero, sem R$ e sem ponto "
    "de milhar. Se ele citar material, horas ou INSS, mande junto "
    "\"modo\":\"avancado\".\n"
    "modo troca o modo de calculo sozinho, com \"modo\":\"padrao\" ou "
    "\"avancado\".\n"
    "salvar abre o formulario de registro. Use so quando ele pedir para "
    "salvar.\n"
    "No maximo um bloco por resposta. Se nao for agir, nao mande bloco "
    "nenhum.\n"
    "Se voce disser que VAI fazer alguma coisa, o bloco e obrigatorio na "
    "mesma resposta. Prometer e nao mandar o bloco e o pior erro possivel, "
    "porque o chefe fica esperando uma coisa que nunca aconteceu. Se nao "
    "for mandar o bloco, nao prometa: diga o caminho para ele fazer.\n"
    "Antes do bloco escreva uma frase curta dizendo o que vai fazer, sem "
    "prometer o resultado: quem calcula e o app, e o numero aparece na tela "
    "depois. Nunca invente um valor que ele nao disse; se faltar algum, "
    "pergunte.\n"
    "\n"
    "COMO ESCREVER\n"
    "O chat mostra texto puro e a voz le em voz alta o que voce escrever. "
    "Nada de markdown: sem asterisco de negrito, sem tabela, sem cabecalho, "
    "sem lista numerada. Asterisco e barra vertical aparecem crus na tela e "
    "sao lidos em voz alta. Se precisar enumerar, use frases curtas "
    "separadas por ponto.\n"
    "Responda em duas a quatro frases. So alongue se ele pedir detalhe.\n"
    "\n"
    "REGRA DURA\n"
    "Os valores do servico sao os que o app calculou e mostrou na tela. "
    "Nunca recalcule nem corrija esses numeros, e nunca invente valor que "
    "nao esteja ali.\n"
    "Voce pode tirar uma conclusao a partir deles, como uma porcentagem ou "
    "uma comparacao, desde que deixe claro que a conta foi sua.\n"
    "Nao invente meta de margem, tabela de preco nem media de mercado. Se o "
    "chefe nao disse qual e o alvo dele, pergunte em vez de supor.\n"
    "Hoje voce tambem nao consegue preencher campo, apertar botao nem salvar "
    "conta. Se pedirem isso, ensine o caminho e seja honesta de que quem "
    "clica e ele.\n"
    "Se nao souber algo especifico do app, diga que nao sabe, em vez de "
    "inventar tela ou botao."
)


# A L.I.L.Y. pede acoes ao app terminando a fala com [[LILY:{...}]]. O bloco
# some antes de virar texto na tela e antes de virar audio: e ordem, nao
# conversa. Nada aqui confia no modelo - o que nao passar na validacao morre
# e so a fala sobrevive.
# O .*? (e nao .+?) e de proposito: bloco vazio tem que casar tambem,
# senao [[LILY:]] escapa da limpeza e aparece cru na tela e no audio.
ACAO_NO_TEXTO = re.compile(r"\[\[LILY:(.*?)\]\]", re.DOTALL)
CAMPOS_DA_CALCULADORA = {"vInicial", "frete", "func", "material", "horas", "inss"}
MODOS = ("padrao", "avancado")


def extrair_acao(texto: str):
    if not texto:
        return texto, None

    achado = ACAO_NO_TEXTO.search(texto)
    limpo = ACAO_NO_TEXTO.sub("", texto).strip()
    if not achado:
        return limpo, None

    try:
        bruto = json.loads(achado.group(1))
    except (ValueError, TypeError):
        return limpo, None

    if not isinstance(bruto, dict):
        return limpo, None

    tipo = bruto.get("tipo")
    if tipo not in ("calcular", "salvar", "modo"):
        return limpo, None

    acao = {"tipo": tipo}

    if tipo == "modo":
        if bruto.get("modo") not in MODOS:
            return limpo, None
        acao["modo"] = bruto["modo"]
        return limpo, acao

    if tipo == "calcular":
        campos = bruto.get("campos")
        if not isinstance(campos, dict):
            return limpo, None
        aceitos = {}
        for chave, valor in campos.items():
            if chave not in CAMPOS_DA_CALCULADORA:
                continue
            try:
                numero = float(valor)
            except (TypeError, ValueError):
                continue
            if numero != numero or numero in (float("inf"), float("-inf")):
                continue
            aceitos[chave] = numero
        if not aceitos:
            return limpo, None
        acao["campos"] = aceitos
        if bruto.get("modo") in MODOS:
            acao["modo"] = bruto["modo"]

    return limpo, acao


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


def formatar_contexto(contexto: Optional[dict]) -> str:
    """Vira o estado da tela em texto para a L.I.L.Y. enxergar o que o
    chefe esta vendo. Defensivo de proposito: chave que faltar so nao
    aparece, porque o front pode mudar antes daqui."""
    if not isinstance(contexto, dict) or not contexto:
        return ""

    def texto(valor) -> Optional[str]:
        # O app manda os valores ja formatados no idioma dele. Aqui a
        # gente so descarta o que veio vazio, para a L.I.L.Y. nunca
        # citar um numero escrito diferente do que esta na tela.
        if valor is None:
            return None
        # O Intl do navegador separa "R$" do numero com espaco nao-quebravel
        # (U+00A0). Vira espaco normal aqui, senao entra caractere invisivel
        # no prompt e pode voltar ecoado torto na resposta.
        limpo = str(valor).replace(chr(160), " ").strip()
        return limpo or None

    linhas = []

    modo = contexto.get("modo")
    if modo:
        pedaco = f"Modo: {str(modo).upper()}."
        hora = texto(contexto.get("valorHora"))
        if hora:
            pedaco += f" Valor da hora configurado: {hora}."
        linhas.append(pedaco)

    campos = contexto.get("campos")
    if isinstance(campos, dict) and campos:
        partes = []
        for nome, valor in campos.items():
            escrito = texto(valor)
            if escrito:
                partes.append(f"{nome} {escrito}")
        if partes:
            linhas.append("Campos preenchidos: " + ", ".join(partes) + ".")
    else:
        linhas.append("Os campos da calculadora estao vazios.")

    resultado = contexto.get("resultado")
    if isinstance(resultado, dict) and resultado:
        partes = []
        for nome, valor in resultado.items():
            escrito = texto(valor)
            if escrito:
                partes.append(f"{nome} {escrito}")
        if partes:
            linhas.append("Resultado na tela: " + ", ".join(partes) + ".")
    else:
        linhas.append("Ainda nao ha resultado calculado na tela.")

    conta = contexto.get("contaSelecionada")
    if isinstance(conta, dict) and conta:
        partes = [str(v) for v in conta.values() if v]
        if partes:
            linhas.append("Servico em andamento: " + ", ".join(partes) + ".")

    salvas = contexto.get("contasNoModo")
    if isinstance(salvas, int):
        linhas.append(f"Contas salvas neste modo: {salvas}.")

    if not linhas:
        return ""

    return (
        "\n\nSITUACAO AGORA (o que esta na tela do chefe neste momento)\n"
        + "\n".join(linhas)
        + "\nUse estes numeros ao responder, citando os que interessam. "
        "Nao recalcule e nao invente outros. Se a pergunta nao tiver nada a "
        "ver com a tela, ignore este bloco."
    )


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


def ask_gemini(
    message: str,
    system_prompt: str = LILY_SYSTEM_PROMPT,
) -> Optional[str]:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None

    payload = {
        "systemInstruction": {
            "parts": [{"text": system_prompt}],
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


def polish_with_groq(
    message: str,
    gemini_context: str,
    system_prompt: str = LILY_SYSTEM_PROMPT,
) -> str:
    prompt = (
        "Use o contexto abaixo para responder ao usuario como L.I.L.Y. "
        "Mantenha em ate 3 frases, natural, sem mencionar Gemini ou Groq.\n\n"
        f"Pergunta do usuario: {message}\n\n"
        f"Contexto:\n{gemini_context}"
    )
    return ask_groq(prompt, LILY_SYSTEM_PROMPT, max_tokens=170) or gemini_context


def ask_lily(message: str, contexto: Optional[dict] = None) -> str:
    # O contexto entra no prompt do SISTEMA, e nao na mensagem: assim o
    # should_use_gemini continua julgando so o que o chefe escreveu.
    prompt = LILY_SYSTEM_PROMPT + formatar_contexto(contexto)
    try:
        if should_use_gemini(message):
            gemini_reply = ask_gemini(message, prompt)
            if gemini_reply:
                return polish_with_groq(message, gemini_reply, prompt)

        groq_reply = ask_groq(message, prompt)
        if groq_reply:
            return groq_reply

        gemini_reply = ask_gemini(message, prompt)
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
        # O texto do provedor ia cru para a tela e para a voz: o chefe
        # ouvia "Error code: 429" com um JSON inteiro atras. Estouro de
        # cota e o caso mais comum e merece uma frase que ele entenda.
        detalhe = str(error)
        if "429" in detalhe or "rate limit" in detalhe.lower():
            return (
                "Bati o limite de uso da IA por enquanto. Espera um pouco e "
                "manda de novo; a calculadora continua funcionando "
                "normalmente."
            )
        return f"Tive um erro ao acessar meu cerebro: {detalhe}"

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
