import os
import sys
import json
import queue
import asyncio
import sounddevice as sd
from vosk import Model, KaldiRecognizer
import edge_tts
import pygame
import keyboard
from groq import Groq
import zipfile
import urllib.request

# --- CONFIGURAÇÃO DA IA ---
client_groq = Groq(api_key="SUA_CHAVE_AQUI")


# --- ADICIONE ESTA FUNÇÃO QUE ESTÁ FALTANDO ---
async def processar_com_ia(texto_usuario):
    try:
        completion = client_groq.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {"role": "system", "content": "Você é a L.I.L.Y., use gírias de programador e responda curto."},
                {"role": "user", "content": texto_usuario}
            ],
            temperature=0.7,
            max_tokens=150
        )
        return completion.choices[0].message.content
    except Exception as e:
        print(f"ERRO NA GROQ: {e}")
        return "Tive um erro de conexão com meu cérebro, chefe."

# --- CONFIGURAÇÕES DE CAMINHOS ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "model")

# Função de Auto-Reparo que você tentou digitar no terminal
def baixar_modelo_automatico():
    URL = "https://alphacephei.com/vosk/models/vosk-model-pt-fb-v0.1.1-pruned.zip"
    ZIP_PATH = os.path.join(BASE_DIR, "model.zip")
    
    if not os.path.exists(MODEL_PATH):
        print("L.I.L.Y: 'Opa, estou sem ouvidos! Baixando modelo inteligente...'")
        urllib.request.urlretrieve(URL, ZIP_PATH)
        
        with zipfile.ZipFile(ZIP_PATH, 'r') as zip_ref:
            zip_ref.extractall(BASE_DIR)
            pasta_extraida = os.path.join(BASE_DIR, "vosk-model-pt-fb-v0.1.1-pruned")
            os.rename(pasta_extraida, MODEL_PATH)
            
        os.remove(ZIP_PATH)
        print("L.I.L.Y: 'Modelo instalado com sucesso!'")

# --- INICIALIZAÇÃO ---
# Chamamos a função antes de carregar o Model
baixar_modelo_automatico()

model = Model(MODEL_PATH)
rec = KaldiRecognizer(model, 16000)
audio_queue = queue.Queue()

def callback(indata, frames, time, status):
    audio_queue.put(bytes(indata))

async def falar(texto):
    print(f"L.I.L.Y diz: {texto}")
    VOICE = "pt-BR-FranciscaNeural"
    OUTPUT_FILE = os.path.join(BASE_DIR, "output.mp3")
    
    communicate = edge_tts.Communicate(texto, VOICE)
    await communicate.save(OUTPUT_FILE)
    
    pygame.mixer.init()
    pygame.mixer.music.load(OUTPUT_FILE)
    pygame.mixer.music.play()
    while pygame.mixer.music.get_busy():
        continue
    pygame.mixer.quit()

async def iniciar_lily():
    await falar("Sistemas iniciados com a Groq. Segure ALT para falar!")
    
    with sd.RawInputStream(samplerate=16000, blocksize=8000, dtype='int16',
                           channels=1, callback=callback):
        while True:
            # PUSH-TO-TALK: Só ouve se segurar a tecla ALT
            if keyboard.is_pressed('alt'):
                data = audio_queue.get()
                if rec.AcceptWaveform(data):
                    result = json.loads(rec.Result())
                    comando = result.get("text", "").lower().strip()
                    
                    if comando:
                        print(f"Você disse: {comando}")
                        if "abrir finanças" in comando:
                            await falar("Abrindo o projeto Finance Shell.")
                            os.system(f'code "C:\\Users\\Lilian\\apps\\financeshell"')
                        else:
                            resposta = await processar_com_ia(comando)
                            await falar(resposta)
            else:
                # Limpa a fila de áudio enquanto o botão não está pressionado
                while not audio_queue.empty():
                    audio_queue.get()
                await asyncio.sleep(0.1)

if __name__ == "__main__":
    try:
        asyncio.run(iniciar_lily())
    except KeyboardInterrupt:
        print("\nLily encerrada.")