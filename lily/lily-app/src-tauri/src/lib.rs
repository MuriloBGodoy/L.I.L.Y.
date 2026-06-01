// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::{
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Mutex,
};

use tauri::Manager;

struct LilyVoiceState {
    child: Mutex<Option<Child>>,
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
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

    let child = Command::new(python)
        .arg(script)
        .current_dir(engine_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Falha ao iniciar o motor Python: {error}"))?;

    *child_slot = Some(child);
    Ok("started".to_string())
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

#[derive(serde::Deserialize)]
struct LilyBridgeResponse {
    reply: String,
}

#[tauri::command]
fn ask_lily_chat(app: tauri::AppHandle, message: String, speak: bool) -> Result<String, String> {
    let engine_dir = find_engine_dir(&app)?;
    let python = find_python_executable(&engine_dir);
    let script = engine_dir.join("lily_bridge.py");

    if !script.exists() {
        return Err("Nao encontrei engine/lily_bridge.py.".to_string());
    }

    let mut command = Command::new(python);
    command
        .arg(script)
        .arg("--message")
        .arg(message)
        .current_dir(engine_dir)
        .stdin(Stdio::null())
        .stderr(Stdio::piped())
        .stdout(Stdio::piped());

    if speak {
        command.arg("--speak");
    }

    let output = command
        .output()
        .map_err(|error| format!("Falha ao chamar a ponte Python: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("A ponte Python falhou: {stderr}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: LilyBridgeResponse = serde_json::from_str(stdout.trim())
        .map_err(|error| format!("Resposta invalida da Lily: {error}"))?;
    Ok(parsed.reply)
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

    // The checked-in venv can become stale when Python is moved/reinstalled.
    // Prefer the current PATH Python; it is the one we install/test dependencies with.
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
            greet,
            start_lily_voice,
            stop_lily_voice,
            ask_lily_chat
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
