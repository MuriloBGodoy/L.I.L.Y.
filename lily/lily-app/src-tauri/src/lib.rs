use std::{
    fs::File,
    io::Write,
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::Duration,
};

use tauri::Manager;

struct LilyVoiceState {
    child: Mutex<Option<Child>>,
}

#[tauri::command]
fn start_lily_voice(
    app: tauri::AppHandle,
    state: tauri::State<'_, LilyVoiceState>,
) -> Result<String, String> {
    let mut child_slot = state
        .child
        .lock()
        .map_err(|_| "Nao foi possivel acessar o estado da voz.".to_string())?;

    if let Some(child) = child_slot.as_mut() {
        if child.try_wait().map_err(|error| error.to_string())?.is_none() {
            return Ok("active".to_string());
        }
    }

    let engine_dir = find_engine_dir(&app)?;
    let python = find_python_executable(&engine_dir);
    let script = engine_dir.join("main.py");
    let log_path = engine_dir.join("lily_voice.log");
    let log_file = File::create(&log_path)
        .map_err(|error| format!("Nao foi possivel criar o log da voz: {error}"))?;
    let log_file_for_stderr = log_file
        .try_clone()
        .map_err(|error| format!("Nao foi possivel preparar o log da voz: {error}"))?;

    let mut child = Command::new(python)
        .arg(script)
        .current_dir(engine_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::from(log_file))
        .stderr(Stdio::from(log_file_for_stderr))
        .spawn()
        .map_err(|error| format!("Falha ao iniciar o motor Python: {error}"))?;

    thread::sleep(Duration::from_millis(900));
    if let Some(status) = child.try_wait().map_err(|error| error.to_string())? {
        let log = std::fs::read_to_string(&log_path).unwrap_or_default();
        let details = log.trim();
        if details.is_empty() {
            return Err(format!("O motor Python encerrou logo apos iniciar: {status}"));
        }
        return Err(format!(
            "O motor Python encerrou logo apos iniciar: {status}. Log: {details}"
        ));
    }

    *child_slot = Some(child);
    Ok(format!("started: {}", log_path.display()))
}

#[tauri::command]
fn stop_lily_voice(state: tauri::State<'_, LilyVoiceState>) -> Result<String, String> {
    let mut child_slot = state
        .child
        .lock()
        .map_err(|_| "Nao foi possivel acessar o estado da voz.".to_string())?;

    if let Some(child) = child_slot.as_mut() {
        let _ = child.kill();
        let _ = child.wait();
    }

    *child_slot = None;
    Ok("stopped".to_string())
}

// Payload vai por stdin: contexto + historico estouram o limite de linha de comando do Windows.
#[tauri::command]
fn ask_lily_chat(
    app: tauri::AppHandle,
    message: String,
    speak: bool,
    contexto: Option<serde_json::Value>,
    historico: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let engine_dir = find_engine_dir(&app)?;
    let python = find_python_executable(&engine_dir);
    let script = engine_dir.join("lily_bridge.py");

    if !script.exists() {
        return Err("Nao encontrei engine/lily_bridge.py.".to_string());
    }

    let payload = serde_json::json!({
        "message": message,
        "speak": speak,
        "contexto": contexto,
        "historico": historico,
    });

    let mut child = Command::new(python)
        .arg(script)
        .arg("--stdin")
        .current_dir(engine_dir)
        .stdin(Stdio::piped())
        .stderr(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Falha ao chamar a ponte Python: {error}"))?;

    {
        // O take() e o fim do bloco fecham o stdin; sem isso o Python fica preso no read().
        let mut stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Nao consegui falar com a ponte Python.".to_string())?;
        stdin
            .write_all(payload.to_string().as_bytes())
            .map_err(|error| format!("Falha ao enviar a pergunta: {error}"))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|error| format!("Falha ao ler a resposta da ponte: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("A ponte Python falhou: {stderr}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value = serde_json::from_str(stdout.trim())
        .map_err(|error| format!("Resposta invalida da Lily: {error}"))?;

    if !parsed.get("reply").map(|r| r.is_string()).unwrap_or(false) {
        return Err("A ponte respondeu sem a fala da Lily.".to_string());
    }

    Ok(parsed)
}

fn find_engine_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let current_dir = std::env::current_dir().map_err(|error| error.to_string())?;
    let mut candidates = vec![
        current_dir.join("engine"),
        current_dir.join("..").join("engine"),
    ];

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("engine"));
    }

    candidates
        .into_iter()
        .find(|path| path.join("main.py").exists())
        .ok_or_else(|| "Nao encontrei a pasta engine/main.py.".to_string())
}

fn find_python_executable(engine_dir: &PathBuf) -> PathBuf {
    if let Ok(custom_python) = std::env::var("LILY_PYTHON") {
        return PathBuf::from(custom_python);
    }

    // O venv versionado quebra quando o Python e reinstalado; prefere o do PATH.
    if which_python_is_available() {
        return PathBuf::from("python");
    }

    let local_python = engine_dir.join("venv").join("Scripts").join("python.exe");
    if local_python.exists() {
        return local_python;
    }

    PathBuf::from("python")
}

fn which_python_is_available() -> bool {
    Command::new("python")
        .arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(LilyVoiceState {
            child: Mutex::new(None),
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            start_lily_voice,
            stop_lily_voice,
            ask_lily_chat
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
