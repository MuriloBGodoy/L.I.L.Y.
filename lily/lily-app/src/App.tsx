import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
  updateEmail,
  updatePassword,
  updateProfile,
  type User,
} from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, db, isFirebaseConfigured, storage } from "./lib/firebase";
import { isSupabaseConfigured, supabase } from "./lib/supabase";

type View = "home" | "settings" | "accounts";
type AccountType = "PF" | "PJ";
type ClientType = "PF" | "PJ";
type OwnerType = "estoque" | "cliente";
type Locale = "pt-BR" | "en-US";
type ToastTone = "success" | "error" | "info";
type LilyVoiceStatus = "idle" | "starting" | "active" | "stopping" | "error";
type AccountImageStatus = "empty" | "ready" | "analyzing" | "done";
type LilyChatMessage = {
  id: number;
  author: "user" | "lily";
  text: string;
};
type LilyWebResponse = {
  reply?: string;
  audio?: string;
  error?: string;
};
type LilyAssistantMode = "voice" | "chat" | null;
type BrowserSpeechRecognitionResult = {
  0: { transcript: string };
  isFinal?: boolean;
};
type BrowserSpeechRecognitionEvent = Event & {
  results: {
    length: number;
    [index: number]: BrowserSpeechRecognitionResult;
  };
};
type BrowserSpeechRecognitionErrorEvent = Event & {
  error?: string;
};
type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type Client = {
  id: number;
  tipo: ClientType;
  nome: string;
  apelido?: string;
  fantasia?: string;
  doc: string;
  tel: string;
  email: string;
  endereco: string;
  ie?: string;
};

type Config = {
  valorHora: number;
  pecas: string[];
  clientes: Client[];
};

type LilyAccount = {
  id: number;
  user_id?: string;
  docId?: string;
  marca: string;
  veiculo: string;
  tipoPeca: string;
  clienteNome: string;
  data: string;
  modo: boolean;
  vInicial: string;
  frete: string;
  func: string;
  material: string;
  horas: string;
  inss: string;
  vendidoPor: string;
  maoDeObra: string;
  total: number;
};

type UserData = {
  nome: string;
  user: string;
  email?: string;
  phone?: string;
  doc?: string;
  type?: AccountType;
  photoURL?: string;
};

type ProfileForm = {
  nome: string;
  user: string;
  email: string;
  phone: string;
  doc: string;
  type: AccountType;
  photoURL: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

type AccountForm = {
  marca: string;
  veiculo: string;
  tipoPeca: string;
  tipoProprietario: OwnerType;
  proprietario: string;
  clienteSelect: string;
  clienteTelefone: string;
  vendidoPorInput: string;
  maoDeObraInput: string;
};

type MainInputs = {
  vInicial: string;
  frete: string;
  func: string;
  material: string;
  horas: string;
  inss: string;
};

type RegisterForm = {
  nome: string;
  email: string;
  doc: string;
  phone: string;
  user: string;
  pass: string;
  confirmPass: string;
  acceptedTerms: boolean;
};

type Results = {
  venda: number;
  custo: number;
  lucro: number;
  montagem?: number;
  cm?: number;
  mv?: number;
};

type ToastMessage = {
  id: number;
  tone: ToastTone;
  message: string;
};

const marcas = [
  "Volkswagen",
  "Fiat",
  "General Motors",
  "Ford",
  "Hyundai",
  "Toyota",
  "Nissan",
  "Honda",
  "Renault",
  "Peugeot",
  "Citroen",
  "Kia",
  "Chevrolet",
  "Jeep",
  "Mitsubishi",
  "Subaru",
  "Mercedes-Benz",
  "BMW",
  "Audi",
  "Volvo",
  "Scania",
  "MAN",
  "Iveco",
];

const defaultConfig: Config = {
  valorHora: 40,
  pecas: ["Radiador", "Caixa", "Intercooler", "Condensador"],
  clientes: [],
};

const defaultAccountForm: AccountForm = {
  marca: "",
  veiculo: "",
  tipoPeca: "",
  tipoProprietario: "estoque",
  proprietario: "",
  clienteSelect: "",
  clienteTelefone: "",
  vendidoPorInput: "",
  maoDeObraInput: "",
};

const defaultMainInputs: MainInputs = {
  vInicial: "",
  frete: "",
  func: "",
  material: "",
  horas: "",
  inss: "",
};

const defaultRegisterForm: RegisterForm = {
  nome: "",
  email: "",
  doc: "",
  phone: "",
  user: "",
  pass: "",
  confirmPass: "",
  acceptedTerms: false,
};

const defaultProfileForm: ProfileForm = {
  nome: "",
  user: "",
  email: "",
  phone: "",
  doc: "",
  type: "PF",
  photoURL: "",
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

const lilyWebServerUrl =
  import.meta.env.VITE_LILY_WEB_SERVER_URL ?? "http://127.0.0.1:8765";

const defaultLilyChatMessages: LilyChatMessage[] = [
  {
    id: 1,
    author: "lily",
    text: "Opa, estou por aqui. Pode mandar uma mensagem ou ativar minha voz pelo painel.",
  },
];

const translations = {
  "pt-BR": {
    appSubtitle: "From Santa Rita Radiadores",
    userMenuAccount: "Conta",
    userMenuProfile: "Editar perfil",
    userMenuLanguage: "Idioma",
    userMenuLogout: "Sair",
    userMenuLocal: "Sessão local",
    profileTitle: "Perfil do usuário",
    profileSubtitle: "Gerencie nome, login e dados de contato usados pela L.I.L.Y.",
    profileIdentity: "Identidade",
    profileAccess: "Acesso",
    profilePhoto: "Foto de perfil",
    profilePhotoHint: "JPG, PNG ou WEBP até 2 MB. A imagem será sincronizada no perfil.",
    profileChangePhoto: "Alterar foto",
    profileRemovePhoto: "Remover foto",
    profileSave: "Salvar alterações",
    profileSaving: "Salvando...",
    profileSavingStatus: "Salvando alterações no perfil...",
    profileCancel: "Cancelar",
    profileSaved: "Perfil atualizado com sucesso.",
    profileEmailAuthWarning:
      "Dados salvos. Para alterar o e-mail de autenticação no Firebase, faça login novamente e tente outra vez.",
    profileName: "Nome ou razão social",
    profileUser: "Usuário",
    profileEmail: "E-mail",
    profilePhone: "Telefone",
    profileDoc: "Documento",
    profileType: "Tipo de conta",
    profileNewPassword: "Nova senha",
    profileCurrentPassword: "Senha atual",
    profileConfirmPassword: "Confirmar nova senha",
    profileCurrentPasswordPlaceholder: "Obrigatória para alterar e-mail ou senha",
    profilePasswordPlaceholder: "Deixe em branco para manter a senha atual",
    profilePasswordUpdated: "Senha atualizada.",
    profilePasswordRecentLogin:
      "Para alterar a senha ou o e-mail, faça login novamente e tente outra vez.",
    profilePhotoTooLarge: "A imagem precisa ter até 2 MB.",
    profilePhotoInvalid: "Escolha uma imagem JPG, PNG ou WEBP.",
    profilePhotoUploadFailed:
      "Não foi possível sincronizar a foto agora. Os outros dados serão salvos.",
    lilyAssistantTitle: "L.I.L.Y Assistente",
    lilyAssistantSubtitle: "Ative a voz no app desktop ou converse comigo por mensagem.",
    lilyVoice: "Voz",
    lilyVoiceIdle: "Desativada",
    lilyVoiceStarting: "Iniciando...",
    lilyVoiceActive: "Ativa",
    lilyVoiceStopping: "Encerrando...",
    lilyVoiceError: "Erro",
    lilyVoiceStart: "Ativar voz",
    lilyVoiceStop: "Desativar voz",
    lilyVoiceDesktopOnly:
      "A voz usa o motor Python e precisa rodar pelo app desktop do Tauri.",
    lilyVoiceHintActive: "Use ALT para falar quando a voz estiver ativa.",
    lilyVoiceWebHint: "Na web, clique em ativar e permita o microfone.",
    lilyVoiceStarted: "Voz da L.I.L.Y ativada. Segure ALT para falar.",
    lilyVoiceWebStarted: "Voz da L.I.L.Y ativada no navegador.",
    lilyVoiceStopped: "Voz da L.I.L.Y desativada.",
    lilyVoiceErrorMessage: "Não foi possível controlar a voz da L.I.L.Y.",
    lilyVoiceUnsupported:
      "Seu navegador não liberou reconhecimento de voz. Tente Chrome ou Edge.",
    lilyCoreLabel: "Núcleo neural",
    lilyCoreHint: "Clique no núcleo para escolher voz ou mensagem.",
    lilyChooseMode: "Escolha como conversar",
    lilyVoiceMode: "Chat de voz",
    lilyMessageMode: "Chat mensagem",
    lilyChat: "Chat",
    lilyChatPlaceholder: "Digite uma mensagem para a L.I.L.Y...",
    lilyChatSend: "Enviar",
    lilyChatThinking: "L.I.L.Y pensando...",
    lilyChatError: "Não consegui responder agora.",
    verifyEmailSent:
      "Cadastro criado. Enviamos um e-mail de confirmação antes de liberar o acesso.",
    verifyEmailRequired:
      "Confirme seu e-mail antes de acessar. Reenviamos o link de verificação.",
    verifyEmailSendError:
      "Não foi possível enviar o e-mail de verificação agora.",
    personPf: "Pessoa Física",
    personPj: "Empresa",
    authBadge: "Santa Rita Radiadores",
    authHeroText:
      "Assistente de cálculo, cadastro e organização comercial em uma interface mais limpa e direta para o dia a dia.",
    authHighlightControlTitle: "Mais controle",
    authHighlightControlText: "Custos, peças, clientes e contas no mesmo fluxo.",
    authHighlightSpeedTitle: "Mais velocidade",
    authHighlightSpeedText: "Entradas simples, cálculo rápido e histórico centralizado.",
    authLoginKicker: "Acessar conta",
    authRegisterKicker: "Criar acesso",
    authLoginTitle: "Entrar",
    authRegisterTitle: "Cadastro",
    authLoginSubtitle: "Entre para continuar usando a plataforma.",
    authRegisterSubtitle: "Preencha seus dados para criar um novo acesso.",
    email: "E-mail",
    password: "Senha",
    loginSubmit: "Entrar",
    noAccount: "Não tem conta?",
    createRegistration: "Criar cadastro",
    loginEmailPlaceholder: "seuemail@empresa.com",
    passwordPlaceholder: "Digite sua senha",
    registerNamePlaceholder: "Informe o nome principal",
    registerEmailPlaceholder: "email@empresa.com",
    registerUserPlaceholder: "Nome de acesso",
    registerPasswordPlaceholder: "Crie uma senha segura",
    registerConfirmPassword: "Confirmar senha",
    registerConfirmPasswordPlaceholder: "Repita sua senha",
    termsAcceptPrefix: "Aceito os",
    termsUse: "termos de uso",
    termsAcceptSuffix: "da plataforma.",
    finishRegistration: "Finalizar registro",
    alreadyAccount: "Já tem conta?",
    doLogin: "Fazer login",
    termsTitle: "Termos de Uso - L.I.L.Y",
    termsGuide: "Diretrizes L.I.L.Y",
    termsUseTitle: "1. Uso da Ferramenta:",
    termsUseText: "A L.I.L.Y é um assistente de cálculo para radiadores e serviços.",
    termsDataTitle: "2. Dados:",
    termsDataText:
      "Seus dados de login e faturamento podem ser mantidos localmente e nos serviços conectados.",
    termsResponsibilityTitle: "3. Responsabilidade:",
    termsResponsibilityText:
      "Valores de INSS e margens de lucro devem ser conferidos periodicamente pelo gestor.",
    termsAcceptButton: "Entendi e Aceito",
    sidebarTitle: "L.I.L.Y Menu",
    settingsPanel: "Painel de Configurações",
    viewAccounts: "Visualizar Contas Cadastradas",
    piece: "Peça",
    ourStock: "Estoque Nosso",
    initialValue: "Valor Inicial (R$)",
    freight: "Frete (R$)",
    employee: "Funcionário (R$)",
    material: "Material (R$)",
    serviceHours: "Horas de Serviço",
    calculate: "Calcular",
    newAccount: "Nova Conta",
    editAccount: "Editar Conta",
    registerAccount: "Cadastrar Conta",
    clear: "Apagar",
    yellowResult: "Resultado Amarela",
    blueResult: "Resultado Azul",
    sellFor: "Se Vender Por",
    soldFor: "Vendido Por",
    labor: "Mão de Obra",
    cost: "Custo",
    finalProfit: "Lucro Final",
    assembly: "Montagem",
    coreAssembly: "Colmeia + Montagem",
    assemblySale: "Montagem + Venda",
    back: "Voltar",
    settings: "Configurações",
    hourlyValue: "Valor da Hora",
    hourlyValueDesc: "Define o custo da mão de obra nos cálculos azul.",
    pieceTypes: "Tipos de Peça",
    pieceTypesDesc: "Gerencie os itens como Radiador, Intercooler e outros.",
    clients: "Clientes",
    clientsDesc: "Cadastre pessoa física ou jurídica.",
    registeredAccounts: "Contas Cadastradas",
    yellow: "AMARELA",
    blue: "AZUL",
    searchVehicleClient: "Buscar veículo ou cliente...",
    allBrands: "Todas as Marcas",
    emptyAccounts: "Nenhum registro encontrado.",
    noVehicle: "Sem Veículo",
    general: "Geral",
    notInformed: "Não informada",
    client: "Cliente",
    singleClient: "Cliente",
    walkIn: "Avulso",
    selectBrand: "Selecione uma marca...",
    vehicleName: "Nome do Veículo",
    selectPieceType: "Selecione o tipo de peça...",
    selectRegisteredClient: "Selecionar Cliente Cadastrado...",
    clientPhone: "Telefone do Cliente",
    soldByValue: "Vendido Por (R$)",
    laborValue: "Mão de Obra (R$)",
    update: "Atualizar",
    confirm: "Confirmar",
    cancel: "Cancelar",
    save: "Salvar",
    hourlyPlaceholder: "Valor por hora",
    managePieces: "Gerenciar Peças",
    pieceName: "Nome da peça",
    addPiece: "Adicionar Peça",
    registerClient: "Cadastrar Cliente",
    fullName: "Nome Completo",
    nickname: "Apelido",
    companyName: "Razão Social",
    tradeName: "Nome Fantasia",
    stateRegistration: "Inscrição Estadual",
    phone: "Telefone",
    address: "Endereço",
    saveClient: "Salvar Cliente",
    doc: "Doc",
    contact: "Contato",
    noPhone: "Sem telefone",
    alertRequiredRegister: "Preencha os campos obrigatórios para criar a conta.",
    alertPasswordMismatch: "A confirmação de senha não confere.",
    alertAcceptTerms: "Você precisa aceitar os termos de uso.",
    alertFirebaseLocal:
      "Firebase ainda não configurado. O acesso ficou salvo apenas localmente por enquanto.",
    alertRegisterSuccess: "Conta criada com sucesso.",
    alertRegisterError: "Erro ao registrar",
    alertLoginError: "Usuário ou senha incorretos.",
    alertDeleteConfirm: "Deseja excluir permanentemente este registro?",
    alertDeleteError: "Erro ao deletar",
    alertAccountRequired: "Marca, veículo e tipo de peça são obrigatórios.",
    alertUserNotLogged: "Usuário não logado.",
    alertSaveError: "Erro ao salvar",
    alertSavedLocally: "Conta salva localmente.",
    alertAccountUpdated: "Conta atualizada com sucesso.",
    alertAccountSaved: "Conta salva com sucesso.",
    alertClientRequired: "Nome/Razão Social e documento são obrigatórios.",
    alertRemoveClient: "Deseja remover este cliente?",
    accountImageTitle: "Imagem para reconhecimento",
    accountImageSubtitle:
      "Insira ou capture uma foto da peca para preencher marca, veiculo e tipo com TensorFlow/Gemini.",
    accountImageUpload: "Inserir imagem",
    accountImageCapture: "Capturar",
    accountImageAnalyze: "Reconhecer",
    accountImageRemove: "Remover",
    accountImageEmpty: "Nenhuma imagem selecionada.",
    accountImageReady: "Imagem pronta para analise.",
    accountImageAnalyzing: "Analisando imagem...",
    accountImageDone: "Campos preenchidos com base na imagem.",
    accountImageInvalid: "Escolha uma imagem JPG, PNG ou WEBP.",
    accountImagePlaceholder: "Preview da imagem",
    accountDataSection: "Dados da conta",
    accountOwnerSection: "Proprietario",
    accountValuesSection: "Valores",
  },
  "en-US": {
    appSubtitle: "From Santa Rita Radiadores",
    userMenuAccount: "Account",
    userMenuProfile: "Edit profile",
    userMenuLanguage: "Language",
    userMenuLogout: "Log out",
    userMenuLocal: "Local session",
    profileTitle: "User profile",
    profileSubtitle: "Manage name, login and contact data used by L.I.L.Y.",
    profileIdentity: "Identity",
    profileAccess: "Access",
    profilePhoto: "Profile photo",
    profilePhotoHint: "JPG, PNG or WEBP up to 2 MB. The image will sync with the profile.",
    profileChangePhoto: "Change photo",
    profileRemovePhoto: "Remove photo",
    profileSave: "Save changes",
    profileSaving: "Saving...",
    profileSavingStatus: "Saving profile changes...",
    profileCancel: "Cancel",
    profileSaved: "Profile updated successfully.",
    profileEmailAuthWarning:
      "Data saved. To change the Firebase authentication email, sign in again and try once more.",
    profileName: "Name or company name",
    profileUser: "Username",
    profileEmail: "Email",
    profilePhone: "Phone",
    profileDoc: "Document",
    profileType: "Account type",
    profileNewPassword: "New password",
    profileCurrentPassword: "Current password",
    profileConfirmPassword: "Confirm new password",
    profileCurrentPasswordPlaceholder: "Required to change email or password",
    profilePasswordPlaceholder: "Leave blank to keep the current password",
    profilePasswordUpdated: "Password updated.",
    profilePasswordRecentLogin:
      "To change password or email, sign in again and try once more.",
    profilePhotoTooLarge: "The image must be up to 2 MB.",
    profilePhotoInvalid: "Choose a JPG, PNG or WEBP image.",
    profilePhotoUploadFailed:
      "Could not sync the photo now. The other data will be saved.",
    lilyAssistantTitle: "L.I.L.Y Assistant",
    lilyAssistantSubtitle: "Enable voice in the desktop app or chat with me by message.",
    lilyVoice: "Voice",
    lilyVoiceIdle: "Disabled",
    lilyVoiceStarting: "Starting...",
    lilyVoiceActive: "Active",
    lilyVoiceStopping: "Stopping...",
    lilyVoiceError: "Error",
    lilyVoiceStart: "Enable voice",
    lilyVoiceStop: "Disable voice",
    lilyVoiceDesktopOnly:
      "Voice uses the Python engine and must run from the Tauri desktop app.",
    lilyVoiceHintActive: "Hold ALT to speak while voice is active.",
    lilyVoiceWebHint: "On web, enable voice and allow microphone access.",
    lilyVoiceStarted: "L.I.L.Y voice enabled. Hold ALT to speak.",
    lilyVoiceWebStarted: "L.I.L.Y voice enabled in the browser.",
    lilyVoiceStopped: "L.I.L.Y voice disabled.",
    lilyVoiceErrorMessage: "Could not control L.I.L.Y voice.",
    lilyVoiceUnsupported:
      "Your browser did not allow speech recognition. Try Chrome or Edge.",
    lilyCoreLabel: "Neural core",
    lilyCoreHint: "Click the core to choose voice or message.",
    lilyChooseMode: "Choose how to talk",
    lilyVoiceMode: "Voice chat",
    lilyMessageMode: "Message chat",
    lilyChat: "Chat",
    lilyChatPlaceholder: "Type a message to L.I.L.Y...",
    lilyChatSend: "Send",
    lilyChatThinking: "L.I.L.Y is thinking...",
    lilyChatError: "I could not answer right now.",
    verifyEmailSent:
      "Registration created. We sent a confirmation email before enabling access.",
    verifyEmailRequired:
      "Confirm your email before signing in. We resent the verification link.",
    verifyEmailSendError:
      "Could not send the verification email right now.",
    personPf: "Individual",
    personPj: "Company",
    authBadge: "Santa Rita Radiadores",
    authHeroText:
      "Calculation, registration and sales organization assistant in a cleaner daily workflow.",
    authHighlightControlTitle: "More control",
    authHighlightControlText: "Costs, parts, clients and accounts in one flow.",
    authHighlightSpeedTitle: "More speed",
    authHighlightSpeedText: "Simple inputs, fast calculation and centralized history.",
    authLoginKicker: "Account access",
    authRegisterKicker: "Create access",
    authLoginTitle: "Sign in",
    authRegisterTitle: "Register",
    authLoginSubtitle: "Sign in to continue using the platform.",
    authRegisterSubtitle: "Fill in your details to create a new access.",
    email: "Email",
    password: "Password",
    loginSubmit: "Sign in",
    noAccount: "No account?",
    createRegistration: "Create registration",
    loginEmailPlaceholder: "you@company.com",
    passwordPlaceholder: "Enter your password",
    registerNamePlaceholder: "Enter the main name",
    registerEmailPlaceholder: "email@company.com",
    registerUserPlaceholder: "Access name",
    registerPasswordPlaceholder: "Create a secure password",
    registerConfirmPassword: "Confirm password",
    registerConfirmPasswordPlaceholder: "Repeat your password",
    termsAcceptPrefix: "I accept the",
    termsUse: "terms of use",
    termsAcceptSuffix: "of the platform.",
    finishRegistration: "Finish registration",
    alreadyAccount: "Already have an account?",
    doLogin: "Sign in",
    termsTitle: "Terms of Use - L.I.L.Y",
    termsGuide: "L.I.L.Y Guidelines",
    termsUseTitle: "1. Tool usage:",
    termsUseText: "L.I.L.Y is a calculation assistant for radiators and services.",
    termsDataTitle: "2. Data:",
    termsDataText:
      "Your login and billing data may be stored locally and in connected services.",
    termsResponsibilityTitle: "3. Responsibility:",
    termsResponsibilityText:
      "INSS values and profit margins must be reviewed periodically by management.",
    termsAcceptButton: "I Understand and Accept",
    sidebarTitle: "L.I.L.Y Menu",
    settingsPanel: "Settings Panel",
    viewAccounts: "View Registered Accounts",
    piece: "Part",
    ourStock: "Our Stock",
    initialValue: "Initial Value (R$)",
    freight: "Freight (R$)",
    employee: "Employee (R$)",
    material: "Material (R$)",
    serviceHours: "Service Hours",
    calculate: "Calculate",
    newAccount: "New Account",
    editAccount: "Edit Account",
    registerAccount: "Register Account",
    clear: "Clear",
    yellowResult: "Yellow Result",
    blueResult: "Blue Result",
    sellFor: "Sell For",
    soldFor: "Sold For",
    labor: "Labor",
    cost: "Cost",
    finalProfit: "Final Profit",
    assembly: "Assembly",
    coreAssembly: "Core + Assembly",
    assemblySale: "Assembly + Sale",
    back: "Back",
    settings: "Settings",
    hourlyValue: "Hourly Value",
    hourlyValueDesc: "Sets labor cost in blue calculations.",
    pieceTypes: "Part Types",
    pieceTypesDesc: "Manage items such as Radiator, Intercooler and more.",
    clients: "Clients",
    clientsDesc: "Register individuals or companies.",
    registeredAccounts: "Registered Accounts",
    yellow: "YELLOW",
    blue: "BLUE",
    searchVehicleClient: "Search vehicle or client...",
    allBrands: "All Brands",
    emptyAccounts: "No records found.",
    noVehicle: "No Vehicle",
    general: "General",
    notInformed: "Not informed",
    client: "Client",
    singleClient: "Client",
    walkIn: "Walk-in",
    selectBrand: "Select a brand...",
    vehicleName: "Vehicle Name",
    selectPieceType: "Select part type...",
    selectRegisteredClient: "Select Registered Client...",
    clientPhone: "Client Phone",
    soldByValue: "Sold For (R$)",
    laborValue: "Labor (R$)",
    update: "Update",
    confirm: "Confirm",
    cancel: "Cancel",
    save: "Save",
    hourlyPlaceholder: "Hourly value",
    managePieces: "Manage Parts",
    pieceName: "Part name",
    addPiece: "Add Part",
    registerClient: "Register Client",
    fullName: "Full Name",
    nickname: "Nickname",
    companyName: "Legal Name",
    tradeName: "Trade Name",
    stateRegistration: "State Registration",
    phone: "Phone",
    address: "Address",
    saveClient: "Save Client",
    doc: "Doc",
    contact: "Contact",
    noPhone: "No phone",
    alertRequiredRegister: "Fill in the required fields to create the account.",
    alertPasswordMismatch: "Password confirmation does not match.",
    alertAcceptTerms: "You need to accept the terms of use.",
    alertFirebaseLocal:
      "Firebase is not configured yet. Access was saved locally for now.",
    alertRegisterSuccess: "Account created successfully.",
    alertRegisterError: "Registration error",
    alertLoginError: "Incorrect username or password.",
    alertDeleteConfirm: "Delete this record permanently?",
    alertDeleteError: "Delete error",
    alertAccountRequired: "Brand, vehicle and part type are required.",
    alertUserNotLogged: "User is not logged in.",
    alertSaveError: "Save error",
    alertSavedLocally: "Account saved locally.",
    alertAccountUpdated: "Account updated successfully.",
    alertAccountSaved: "Account saved successfully.",
    alertClientRequired: "Name/company name and document are required.",
    alertRemoveClient: "Remove this client?",
    accountImageTitle: "Image recognition",
    accountImageSubtitle:
      "Insert or capture a part photo to fill brand, vehicle and type with TensorFlow/Gemini.",
    accountImageUpload: "Insert image",
    accountImageCapture: "Capture",
    accountImageAnalyze: "Recognize",
    accountImageRemove: "Remove",
    accountImageEmpty: "No image selected.",
    accountImageReady: "Image ready for analysis.",
    accountImageAnalyzing: "Analyzing image...",
    accountImageDone: "Fields filled from the image.",
    accountImageInvalid: "Choose a JPG, PNG or WEBP image.",
    accountImagePlaceholder: "Image preview",
    accountDataSection: "Account data",
    accountOwnerSection: "Owner",
    accountValuesSection: "Values",
  },
} satisfies Record<Locale, Record<string, string>>;

function readStorage<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function toNumber(value: string): number {
  const cleaned = value.replace(",", ".").replace(/[^\d.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--/--/----";
  return date.toLocaleString("pt-BR");
}

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }
  return digits
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

function formatCpf(value: string): string {
  return value
    .replace(/\D/g, "")
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function formatCnpj(value: string): string {
  return value
    .replace(/\D/g, "")
    .slice(0, 14)
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function formatDoc(value: string, type: AccountType): string {
  return type === "PF" ? formatCpf(value) : formatCnpj(value);
}

function getPasswordStrength(pass: string) {
  let strength = 0;
  if (pass.length > 5) strength += 25;
  if (/[a-z]/.test(pass) && /[A-Z]/.test(pass)) strength += 25;
  if (/\d/.test(pass)) strength += 25;
  if (/[^a-zA-Z\d]/.test(pass)) strength += 25;

  if (strength < 50) {
    return { label: "Senha Fraca", width: `${strength}%`, color: "#ff4444" };
  }
  if (strength < 100) {
    return { label: "Senha Média", width: `${strength}%`, color: "#ffd600" };
  }
  return { label: "Senha Forte", width: "100%", color: "#00ced1" };
}

function mapSupabaseAccount(row: Record<string, unknown>): LilyAccount {
  const total = Number(row.total ?? 0);
  return {
    id: Number(row.id ?? Date.now()),
    user_id: String(row.user_id ?? ""),
    marca: String(row.marca ?? ""),
    veiculo: String(row.veiculo ?? ""),
    tipoPeca: String(row.tipo_peca ?? row.tipoPeca ?? ""),
    clienteNome: String(row.cliente_nome ?? row.clienteNome ?? ""),
    data: String(row.data ?? new Date().toISOString()),
    modo: Boolean(row.modo),
    vInicial: String(row.vinicial ?? row.vInicial ?? ""),
    frete: String(row.frete ?? ""),
    func: String(row.func ?? ""),
    material: String(row.material ?? ""),
    horas: String(row.horas ?? ""),
    inss: String(row.inss ?? ""),
    vendidoPor: String(row.vendido_por ?? row.vendidoPor ?? ""),
    maoDeObra: String(row.mao_de_obra ?? row.maoDeObra ?? ""),
    total: Number.isFinite(total) ? total : 0,
  };
}

function mapFirebaseAccount(
  docId: string,
  row: Record<string, unknown>,
): LilyAccount {
  return {
    ...mapSupabaseAccount(row),
    docId,
  };
}

function mapPostgresAccount(row: Record<string, unknown>): LilyAccount {
  return {
    id: Number(row.id ?? Date.now()),
    user_id: String(row.firebase_uid ?? ""),
    marca: String(row.brand ?? ""),
    veiculo: String(row.vehicle ?? ""),
    tipoPeca: String(row.piece_type ?? ""),
    clienteNome: String(row.client_name ?? ""),
    data: String(row.created_at ?? new Date().toISOString()),
    modo: Boolean(row.mode_blue),
    vInicial: String(row.initial_value ?? ""),
    frete: String(row.freight ?? ""),
    func: String(row.employee_cost ?? ""),
    material: String(row.material ?? ""),
    horas: String(row.service_hours ?? ""),
    inss: String(row.inss ?? ""),
    vendidoPor: String(row.sold_for ?? ""),
    maoDeObra: String(row.labor ?? ""),
    total: Number(row.total ?? 0),
  };
}

function accountToPostgresPayload(
  payload: Record<string, unknown>,
  firebaseUid: string,
) {
  return {
    id: Number(payload.id ?? Date.now()),
    firebase_uid: firebaseUid,
    brand: String(payload.marca ?? ""),
    vehicle: String(payload.veiculo ?? ""),
    piece_type: String(payload.tipo_peca ?? ""),
    client_name: String(payload.cliente_nome ?? ""),
    created_at: String(payload.data ?? new Date().toISOString()),
    mode_blue: Boolean(payload.modo),
    initial_value: String(payload.vinicial ?? ""),
    freight: String(payload.frete ?? ""),
    employee_cost: String(payload.func ?? ""),
    material: String(payload.material ?? ""),
    service_hours: String(payload.horas ?? ""),
    inss: String(payload.inss ?? ""),
    sold_for: String(payload.vendido_por ?? ""),
    labor: String(payload.mao_de_obra ?? ""),
    total: Number(payload.total ?? 0),
    updated_at: new Date().toISOString(),
  };
}

function calculateResults(inputs: MainInputs, isBlueMode: boolean, valorHora: number): Results {
  const v = toNumber(inputs.vInicial);
  const f = toNumber(inputs.frete);
  const fun = toNumber(inputs.func);
  const p1 = v + f + fun;
  const p2 = p1 * 1.35;
  const p3 = p2 * 1.2;
  const venda = p3 * 1.1;
  const custo = p1 + p2 * 0.2 + p3 * 0.1;

  if (!isBlueMode) {
    return { venda, custo, lucro: venda - custo };
  }

  const plimplim =
    toNumber(inputs.material) +
    toNumber(inputs.horas) * valorHora +
    toNumber(inputs.inss) +
    fun;
  const montagem = plimplim * 1.3;

  return {
    venda,
    custo,
    lucro: venda - custo,
    montagem,
    cm: custo + plimplim,
    mv: venda + montagem,
  };
}

function FloatingInput(props: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="input-group">
      <input
        id={props.id}
        type="text"
        placeholder=" "
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
      <label htmlFor={props.id}>{props.label}</label>
    </div>
  );
}

function ResultRow(props: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={props.strong ? "linha linha-strong" : "linha"}>
      <span>{props.label}</span>
      <span>{props.value}</span>
    </div>
  );
}

function OverlayModal(props: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="section-overlay active">
      <div className="modal-body">
        <button className="close-modal" onClick={props.onClose}>
          ×
        </button>
        <h2>{props.title}</h2>
        {props.children}
      </div>
    </div>
  );
}

function UserAvatar(props: {
  initial: string;
  photoURL?: string;
  className?: string;
}) {
  const className = props.className
    ? `user-avatar ${props.className}`
    : "user-avatar";

  return (
    <div className={className}>
      {props.photoURL ? (
        <img src={props.photoURL} alt="" />
      ) : (
        props.initial
      )}
    </div>
  );
}

function Toasts(props: { messages: ToastMessage[] }) {
  if (props.messages.length === 0) return null;

  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="true">
      {props.messages.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.tone}`}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}

function App() {
  const [view, setView] = useState<View>("home");
  const [isBlueMode, setIsBlueMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authVisible, setAuthVisible] = useState(true);
  const [termsOpen, setTermsOpen] = useState(false);
  const [accountType, setAccountType] = useState<AccountType>("PF");
  const [locale, setLocale] = useState<Locale>(() =>
    readStorage<Locale>("lily_locale", "pt-BR"),
  );
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(() =>
    readStorage<UserData | null>("usuario_logado", null),
  );
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileForm, setProfileForm] =
    useState<ProfileForm>(defaultProfileForm);
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [lilyVoiceStatus, setLilyVoiceStatus] =
    useState<LilyVoiceStatus>("idle");
  const [lilyIsSpeaking, setLilyIsSpeaking] = useState(false);
  const [lilyAssistantOpen, setLilyAssistantOpen] = useState(false);
  const [lilyAssistantMode, setLilyAssistantMode] =
    useState<LilyAssistantMode>(null);
  const [lilyChatMessages, setLilyChatMessages] = useState<LilyChatMessage[]>(
    defaultLilyChatMessages,
  );
  const [lilyChatInput, setLilyChatInput] = useState("");
  const [lilyChatBusy, setLilyChatBusy] = useState(false);
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const browserRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const browserVoiceActiveRef = useRef(false);
  const browserRecognitionListeningRef = useRef(false);
  const browserIsSpeakingRef = useRef(false);
  const browserChatBusyRef = useRef(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [registerForm, setRegisterForm] = useState<RegisterForm>(
    defaultRegisterForm,
  );
  const [config, setConfig] = useState<Config>(() =>
    readStorage<Config>("configLily", defaultConfig),
  );
  const [accounts, setAccounts] = useState<LilyAccount[]>(() =>
    readStorage<LilyAccount[]>("contas", []),
  );
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(
    null,
  );
  const [mainInputs, setMainInputs] = useState<MainInputs>(defaultMainInputs);
  const [results, setResults] = useState<Results | null>(null);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountForm, setAccountForm] = useState<AccountForm>(defaultAccountForm);
  const [accountImagePreview, setAccountImagePreview] = useState("");
  const [accountImageFileName, setAccountImageFileName] = useState("");
  const [accountImageStatus, setAccountImageStatus] =
    useState<AccountImageStatus>("empty");
  const [settingsModal, setSettingsModal] = useState<
    null | "hora" | "pecas" | "clientes"
  >(null);
  const [newPiece, setNewPiece] = useState("");
  const [clientType, setClientType] = useState<ClientType>("PF");
  const [clientForm, setClientForm] = useState({
    nome: "",
    apelido: "",
    cpf: "",
    razaoSocial: "",
    nomeFantasia: "",
    cnpj: "",
    inscEstadual: "",
    tel: "",
    email: "",
    endereco: "",
  });
  const [accountsSearch, setAccountsSearch] = useState("");
  const [accountsBrandFilter, setAccountsBrandFilter] = useState("");

  const passwordStrength = useMemo(
    () => getPasswordStrength(registerForm.pass),
    [registerForm.pass],
  );
  const t = (key: keyof (typeof translations)["pt-BR"]) =>
    translations[locale][key] ?? translations["pt-BR"][key] ?? key;
  const isSessionMarkedActive =
    !isFirebaseConfigured &&
    localStorage.getItem("lily_session_active") === "true" &&
    !!userData;

  const displayName =
    userData?.nome || user?.displayName || user?.email || t("userMenuAccount");
  const displayEmail = userData?.email || user?.email || t("userMenuLocal");
  const displayPhoto = userData?.photoURL || user?.photoURL || "";
  const userInitial = displayName.trim().charAt(0).toUpperCase() || "L";
  const isTauriRuntime = Boolean(
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__,
  );
  const browserSpeechRecognition = (
    window as Window & {
      SpeechRecognition?: BrowserSpeechRecognitionConstructor;
      webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
    }
  ).SpeechRecognition ?? (
    window as Window & {
      SpeechRecognition?: BrowserSpeechRecognitionConstructor;
      webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
    }
  ).webkitSpeechRecognition;
  const browserVoiceSupported =
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    Boolean(browserSpeechRecognition);
  const lilyVoiceLabel = {
    idle: t("lilyVoiceIdle"),
    starting: t("lilyVoiceStarting"),
    active: t("lilyVoiceActive"),
    stopping: t("lilyVoiceStopping"),
    error: t("lilyVoiceError"),
  }[lilyVoiceStatus];
  const lilyCoreStateClass = [
    "lily-core",
    lilyVoiceStatus === "active" ? "is-listening" : "",
    lilyVoiceStatus === "starting" || lilyVoiceStatus === "stopping"
      ? "is-syncing"
      : "",
    lilyIsSpeaking || lilyChatBusy ? "is-speaking" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const accountImageStatusText = {
    empty: t("accountImageEmpty"),
    ready: t("accountImageReady"),
    analyzing: t("accountImageAnalyzing"),
    done: t("accountImageDone"),
  }[accountImageStatus];

  function notify(message: string, tone: ToastTone = "info") {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, tone, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 4200);
  }

  useEffect(() => {
    localStorage.setItem("configLily", JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    localStorage.setItem("contas", JSON.stringify(accounts));
  }, [accounts]);

  useEffect(() => {
    localStorage.setItem("lily_locale", JSON.stringify(locale));
  }, [locale]);

  useEffect(
    () => () => {
      browserVoiceActiveRef.current = false;
      browserRecognitionRef.current?.abort();
      window.speechSynthesis?.cancel();
    },
    [],
  );

  useEffect(
    () => () => {
      if (accountImagePreview) {
        URL.revokeObjectURL(accountImagePreview);
      }
    },
    [accountImagePreview],
  );

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;

    const loadVoices = () => {
      setBrowserVoices(window.speechSynthesis.getVoices());
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  useEffect(() => {
    browserIsSpeakingRef.current = lilyIsSpeaking;
  }, [lilyIsSpeaking]);

  useEffect(() => {
    browserChatBusyRef.current = lilyChatBusy;
  }, [lilyChatBusy]);

  useEffect(() => {
    if (userData) {
      localStorage.setItem("usuario_logado", JSON.stringify(userData));
      localStorage.setItem("lily_session_active", "true");
    } else {
      localStorage.removeItem("usuario_logado");
      localStorage.removeItem("lily_session_active");
    }
  }, [userData]);

  useEffect(() => {
    let mounted = true;

    if (isSessionMarkedActive) {
      setAuthVisible(false);
    }

    if (!isFirebaseConfigured || !auth) {
      if (!isSessionMarkedActive) {
        setAuthVisible(true);
      }
      return () => {
        mounted = false;
      };
    }

    const activeAuth = auth;
    const unsubscribe = onAuthStateChanged(activeAuth, async (currentUser) => {
      if (!mounted) return;
      setUser(currentUser);
      if (currentUser) {
        await currentUser.reload();
        if (!currentUser.emailVerified) {
          try {
            await sendEmailVerification(currentUser);
          } catch {
            notify(t("verifyEmailSendError"), "error");
          }
          await signOut(activeAuth);
          setUser(null);
          setUserData(null);
          setAuthVisible(true);
          notify(t("verifyEmailRequired"), "info");
          return;
        }

        setAuthVisible(false);

        let nextUserData: UserData = {
          nome: currentUser.displayName || currentUser.email || t("userMenuAccount"),
          user: currentUser.email?.split("@")[0] || "usuario",
          email: currentUser.email || "",
        };

        if (db) {
          const userRef = doc(db, "users", currentUser.uid);
          const userSnapshot = await getDoc(userRef);
          if (userSnapshot.exists()) {
            const userDoc = userSnapshot.data();
            nextUserData = {
              nome: String(userDoc.nome ?? nextUserData.nome),
              user: String(userDoc.user ?? nextUserData.user),
              email: String(userDoc.email ?? nextUserData.email),
              phone: String(userDoc.phone ?? ""),
              doc: String(userDoc.doc ?? ""),
              type: (String(userDoc.type ?? "PF") === "PJ" ? "PJ" : "PF") as AccountType,
              photoURL: String(userDoc.photoURL ?? currentUser.photoURL ?? ""),
            };
          }
        }

        if (isSupabaseConfigured && supabase) {
          const { data } = await supabase
            .from("user_profiles")
            .select("*")
            .eq("firebase_uid", currentUser.uid)
            .maybeSingle();

          if (data) {
            nextUserData = {
              nome: String(data.name ?? nextUserData.nome),
              user: String(data.username ?? nextUserData.user),
              email: String(data.email ?? nextUserData.email),
              phone: String(data.phone ?? nextUserData.phone ?? ""),
              doc: String(data.document ?? nextUserData.doc ?? ""),
              type: (String(data.account_type ?? nextUserData.type ?? "PF") === "PJ"
                ? "PJ"
                : "PF") as AccountType,
              photoURL: String(data.photo_url ?? nextUserData.photoURL ?? ""),
            };
          }
        }

        setUserData(nextUserData);
        await loadAccounts(currentUser);
      } else if (!isSessionMarkedActive) {
        setAuthVisible(true);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [isSessionMarkedActive]);

  useEffect(() => {
    if (!accountForm.clienteSelect) return;
    const selectedClient = config.clientes.find(
      (client) => String(client.id) === accountForm.clienteSelect,
    );
    if (!selectedClient) return;
    setAccountForm((prev) => ({
      ...prev,
      clienteTelefone: selectedClient.tel || prev.clienteTelefone,
    }));
  }, [accountForm.clienteSelect, config.clientes]);

  useEffect(() => {
    const editId = localStorage.getItem("editar_conta_id");
    if (!editId || accounts.length === 0) return;
    const account = accounts.find((item) => String(item.id) === editId);
    if (!account) return;
    handleSelectSidebarAccount(account);
    localStorage.removeItem("editar_conta_id");
  }, [accounts]);

  async function loadAccounts(targetUser?: User | null) {
    const currentUser = targetUser ?? user;

    if (isSupabaseConfigured && supabase && currentUser) {
      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .eq("firebase_uid", currentUser.uid)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setAccounts(data.map((row) => mapPostgresAccount(row)));
        return;
      }

      notify(`${t("alertSaveError")}: ${error?.message ?? "Supabase"}`, "error");
    }

    if (!isFirebaseConfigured || !db) {
      setAccounts(readStorage<LilyAccount[]>("contas", []));
      return;
    }

    if (!currentUser) return;

    const accountsQuery = query(
      collection(db, "accounts"),
      where("user_id", "==", currentUser.uid),
      orderBy("data", "desc"),
    );
    const snapshot = await getDocs(accountsQuery);
    setAccounts(
      snapshot.docs.map((accountDoc) =>
        mapFirebaseAccount(accountDoc.id, accountDoc.data() as Record<string, unknown>),
      ),
    );
  }

  function handleCalculate() {
    setResults(calculateResults(mainInputs, isBlueMode, config.valorHora || 40));
  }

  function handleReset() {
    setMainInputs(defaultMainInputs);
    setSelectedAccountId(null);
    setResults(null);
  }

  async function handleToggleLilyVoice() {
    if (lilyVoiceStatus === "starting" || lilyVoiceStatus === "stopping") return;

    if (!isTauriRuntime) {
      toggleBrowserLilyVoice();
      return;
    }

    try {
      if (lilyVoiceStatus === "active") {
        setLilyVoiceStatus("stopping");
        await invoke<string>("stop_lily_voice");
        setLilyVoiceStatus("idle");
        notify(t("lilyVoiceStopped"), "info");
        return;
      }

      setLilyVoiceStatus("starting");
      await invoke<string>("start_lily_voice");
      setLilyVoiceStatus("active");
      notify(t("lilyVoiceStarted"), "success");
    } catch (error) {
      setLilyVoiceStatus("error");
      const message =
        error instanceof Error ? error.message : String(error || t("lilyVoiceError"));
      notify(`${t("lilyVoiceErrorMessage")}: ${message}`, "error");
    }
  }

  function toggleBrowserLilyVoice() {
    if (lilyVoiceStatus === "active") {
      setLilyVoiceStatus("stopping");
      browserVoiceActiveRef.current = false;
      browserRecognitionListeningRef.current = false;
      browserRecognitionRef.current?.stop();
      window.speechSynthesis.cancel();
      setLilyIsSpeaking(false);
      browserRecognitionRef.current = null;
      setLilyVoiceStatus("idle");
      notify(t("lilyVoiceStopped"), "info");
      return;
    }

    if (!browserSpeechRecognition || !browserVoiceSupported) {
      setLilyVoiceStatus("error");
      notify(t("lilyVoiceUnsupported"), "error");
      return;
    }

    try {
      setLilyVoiceStatus("starting");
      browserVoiceActiveRef.current = true;
      const recognition = new browserSpeechRecognition();
      recognition.lang = locale === "pt-BR" ? "pt-BR" : "en-US";
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.onresult = (event) => {
        if (browserIsSpeakingRef.current || browserChatBusyRef.current) return;
        const result = event.results[event.results.length - 1];
        const transcript = result?.[0]?.transcript?.trim();
        if (!transcript) return;
        void handleLilyIncomingMessage(transcript, true);
      };
      recognition.onerror = (event) => {
        browserRecognitionListeningRef.current = false;
        if (!browserVoiceActiveRef.current) return;

        if (event.error === "no-speech" || event.error === "aborted") {
          restartBrowserRecognition();
          return;
        }

        setLilyVoiceStatus("error");
        notify(`${t("lilyVoiceErrorMessage")}: ${event.error ?? ""}`.trim(), "error");
      };
      recognition.onend = () => {
        browserRecognitionListeningRef.current = false;
        if (!browserVoiceActiveRef.current) {
          setLilyVoiceStatus((prev) => (prev === "active" ? "idle" : prev));
          return;
        }
        restartBrowserRecognition();
      };
      browserRecognitionRef.current = recognition;
      startBrowserRecognition();
      setLilyVoiceStatus("active");
      notify(t("lilyVoiceWebStarted"), "success");
      void speakWithPreferredWebVoice(
        locale === "pt-BR"
          ? "Lily ativa no navegador. Pode falar comigo."
          : "Lily is active in the browser. You can talk to me.",
      );
    } catch (error) {
      setLilyVoiceStatus("error");
      const message =
        error instanceof Error ? error.message : String(error || t("lilyVoiceError"));
      notify(`${t("lilyVoiceErrorMessage")}: ${message}`, "error");
    }
  }

  function startBrowserRecognition() {
    const recognition = browserRecognitionRef.current;
    if (
      !recognition ||
      !browserVoiceActiveRef.current ||
      browserRecognitionListeningRef.current ||
      browserIsSpeakingRef.current
    ) {
      return;
    }

    try {
      recognition.start();
      browserRecognitionListeningRef.current = true;
      setLilyVoiceStatus("active");
    } catch {
      browserRecognitionListeningRef.current = false;
    }
  }

  function restartBrowserRecognition(delay = 350) {
    window.setTimeout(() => {
      if (!browserVoiceActiveRef.current || browserIsSpeakingRef.current) return;
      startBrowserRecognition();
    }, delay);
  }

  async function handleSendLilyChat() {
    const message = lilyChatInput.trim();
    if (!message || lilyChatBusy) return;
    await handleLilyIncomingMessage(message, lilyVoiceStatus === "active");
  }

  async function handleLilyIncomingMessage(message: string, shouldSpeak: boolean) {
    const userMessage: LilyChatMessage = {
      id: Date.now(),
      author: "user",
      text: message,
    };

    setLilyChatMessages((prev) => [...prev, userMessage]);
    setLilyChatInput("");
    setLilyChatBusy(true);

    try {
      const webReply = isTauriRuntime
        ? null
        : await askLilyWeb(message, shouldSpeak);
      const reply = isTauriRuntime
        ? await invoke<string>("ask_lily_chat", { message, speak: shouldSpeak })
        : webReply?.reply || createLocalLilyReply(message);

      setLilyChatMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          author: "lily",
          text: reply || createLocalLilyReply(message),
        },
      ]);
      if (shouldSpeak && !isTauriRuntime) {
        if (webReply?.audio) {
          playLilyWebAudio(webReply.audio);
        } else {
          void speakWithPreferredWebVoice(reply || createLocalLilyReply(message));
        }
      }
    } catch {
      setLilyChatMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          author: "lily",
          text: t("lilyChatError"),
        },
      ]);
    } finally {
      setLilyChatBusy(false);
    }
  }

  async function askLilyWeb(message: string, speak: boolean) {
    try {
      const response = await fetch(`${lilyWebServerUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, speak }),
      });
      if (!response.ok) return null;
      const data = (await response.json()) as LilyWebResponse;
      if (data.error) return null;
      return data;
    } catch {
      return null;
    }
  }

  async function speakWithPreferredWebVoice(text: string) {
    try {
      const response = await fetch(`${lilyWebServerUrl}/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, speak: true }),
      });
      if (response.ok) {
        const data = (await response.json()) as LilyWebResponse;
        if (data.audio) {
          playLilyWebAudio(data.audio);
          return;
        }
      }
    } catch {
      // Fallback below keeps browser-only voice usable if the local server is off.
    }

    speakWithBrowserVoice(text);
  }

  function playLilyWebAudio(base64Audio: string) {
    browserIsSpeakingRef.current = true;
    browserRecognitionListeningRef.current = false;
    browserRecognitionRef.current?.stop();
    window.speechSynthesis?.cancel();
    setLilyIsSpeaking(true);

    const audio = new Audio(`data:audio/mpeg;base64,${base64Audio}`);
    audio.onended = () => {
      browserIsSpeakingRef.current = false;
      setLilyIsSpeaking(false);
      restartBrowserRecognition();
    };
    audio.onerror = () => {
      browserIsSpeakingRef.current = false;
      setLilyIsSpeaking(false);
      restartBrowserRecognition();
    };
    void audio.play().catch(() => {
      browserIsSpeakingRef.current = false;
      setLilyIsSpeaking(false);
      restartBrowserRecognition();
    });
  }

  function speakWithBrowserVoice(text: string) {
    if (!("speechSynthesis" in window)) return;
    browserIsSpeakingRef.current = true;
    browserRecognitionListeningRef.current = false;
    browserRecognitionRef.current?.stop();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = locale === "pt-BR" ? "pt-BR" : "en-US";
    utterance.rate = locale === "pt-BR" ? 0.94 : 0.98;
    utterance.pitch = 1.02;
    utterance.volume = 1;

    const voices = browserVoices.length
      ? browserVoices
      : window.speechSynthesis.getVoices();

    if (voices.length === 0) {
      browserIsSpeakingRef.current = false;
      window.setTimeout(() => speakWithBrowserVoice(text), 250);
      return;
    }

    const targetLang = utterance.lang.toLowerCase();
    const scoreVoice = (voice: SpeechSynthesisVoice) => {
      const name = voice.name.toLowerCase();
      const lang = voice.lang.toLowerCase();
      let score = 0;

      if (lang === targetLang) score += 12;
      else if (lang.startsWith(targetLang.split("-")[0])) score += 5;
      if (/francisca|maria|female|natural|online/.test(name)) score += 6;
      if (/google|helena|luciana/.test(name)) score += 3;
      if (/male|daniel/.test(name)) score -= 4;
      if (voice.localService) score += 1;

      return score;
    };
    const preferredVoice = voices
      .filter((voice) =>
        voice.lang.toLowerCase().startsWith(targetLang.split("-")[0]),
      )
      .sort((a, b) => scoreVoice(b) - scoreVoice(a))[0];

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }
    utterance.onstart = () => {
      browserIsSpeakingRef.current = true;
      setLilyIsSpeaking(true);
    };
    utterance.onend = () => {
      browserIsSpeakingRef.current = false;
      setLilyIsSpeaking(false);
      restartBrowserRecognition();
    };
    utterance.onerror = () => {
      browserIsSpeakingRef.current = false;
      setLilyIsSpeaking(false);
      restartBrowserRecognition();
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  function createLocalLilyReply(message: string) {
    const normalized = message.toLowerCase();
    if (normalized.includes("calcular") || normalized.includes("conta")) {
      return "Manda os valores nos campos principais e aperta Calcular. Se quiser guardar, usa Cadastrar Conta depois.";
    }
    if (normalized.includes("voz") || normalized.includes("microfone")) {
      return isTauriRuntime
        ? "Pra voz funcionar, ativa o painel e segura ALT enquanto fala comigo."
        : "Na web eu uso a voz do navegador. Ativa o chat de voz e libera o microfone quando aparecer a permissão.";
    }
    if (normalized.includes("cliente")) {
      return "Clientes ficam em Configurações > Clientes. Depois você consegue vincular no cadastro da conta.";
    }
    return "Recebi sua mensagem. Por enquanto este chat está no modo assistente local; quando ligarmos a IA, eu respondo com mais contexto.";
  }

  function handleAccountImageFile(file?: File | null) {
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      notify(t("accountImageInvalid"), "error");
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setAccountImagePreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return previewUrl;
    });
    setAccountImageFileName(file.name);
    setAccountImageStatus("ready");
  }

  function clearAccountImage() {
    setAccountImagePreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return "";
    });
    setAccountImageFileName("");
    setAccountImageStatus("empty");
  }

  function normalizeImageToken(value: string) {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function applyAccountImageRecognition() {
    if (!accountImagePreview) return;

    setAccountImageStatus("analyzing");

    const source = normalizeImageToken(accountImageFileName);
    const recognizedBrand = marcas.find((marca) =>
      source.includes(normalizeImageToken(marca)),
    );
    const recognizedPiece = config.pecas.find((piece) =>
      source.includes(normalizeImageToken(piece)),
    );
    const guessedVehicle = source
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[_-]+/g, " ")
      .replace(/\b(img|image|foto|peca|radiador|intercooler|condensador|caixa)\b/g, "")
      .replace(recognizedBrand ? normalizeImageToken(recognizedBrand) : "", "")
      .replace(recognizedPiece ? normalizeImageToken(recognizedPiece) : "", "")
      .replace(/\s+/g, " ")
      .trim();

    setAccountForm((prev) => ({
      ...prev,
      marca: recognizedBrand || prev.marca,
      tipoPeca: recognizedPiece || prev.tipoPeca,
      veiculo: guessedVehicle
        ? guessedVehicle.replace(/\b\w/g, (letter) => letter.toUpperCase())
        : prev.veiculo,
    }));

    setAccountImageStatus("done");
    notify(t("accountImageDone"), "success");
  }

  function handleNewAccount() {
    setSelectedAccountId(null);
    setMainInputs(defaultMainInputs);
    setResults(null);
    setAccountForm(defaultAccountForm);
    clearAccountImage();
  }

  function applyAccountToForm(account: LilyAccount) {
    const nextInputs = {
      vInicial: account.vInicial,
      frete: account.frete,
      func: account.func,
      material: account.material,
      horas: account.horas,
      inss: account.inss,
    };
    const matchedClient = config.clientes.find(
      (client) => client.nome === account.clienteNome,
    );

    setSelectedAccountId(account.id);
    setIsBlueMode(account.modo);
    setMainInputs(nextInputs);
    setAccountForm({
      marca: account.marca,
      veiculo: account.veiculo,
      tipoPeca: account.tipoPeca,
      tipoProprietario: account.clienteNome ? "cliente" : "estoque",
      proprietario: account.clienteNome ? "Responsável da Venda" : "",
      clienteSelect: matchedClient ? String(matchedClient.id) : "",
      clienteTelefone: matchedClient?.tel || account.clienteNome,
      vendidoPorInput: account.vendidoPor,
      maoDeObraInput: account.maoDeObra,
    });
    clearAccountImage();
    setResults(calculateResults(nextInputs, account.modo, config.valorHora || 40));
  }

  async function handleRegister() {
    if (
      !registerForm.nome ||
      !registerForm.email ||
      !registerForm.pass ||
      !registerForm.user
    ) {
      notify(t("alertRequiredRegister"), "error");
      return;
    }

    if (registerForm.pass !== registerForm.confirmPass) {
      notify(t("alertPasswordMismatch"), "error");
      return;
    }

    if (!registerForm.acceptedTerms) {
      notify(t("alertAcceptTerms"), "error");
      return;
    }

    if (!isFirebaseConfigured || !auth || !db) {
      const localUser = {
        nome: registerForm.nome,
        user: registerForm.user,
        email: registerForm.email,
        phone: registerForm.phone,
        doc: registerForm.doc,
        type: accountType,
        photoURL: "",
      };
      setUserData(localUser);
      setAuthVisible(false);
      notify(t("alertFirebaseLocal"), "info");
      return;
    }

    try {
      const credential = await createUserWithEmailAndPassword(
        auth,
        registerForm.email,
        registerForm.pass,
      );

      await updateProfile(credential.user, { displayName: registerForm.nome });
      await sendEmailVerification(credential.user);
      await setDoc(doc(db, "users", credential.user.uid), {
        nome: registerForm.nome,
        user: registerForm.user,
        email: registerForm.email,
        phone: registerForm.phone,
        doc: registerForm.doc,
        type: accountType,
        createdAt: serverTimestamp(),
      });

      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase.from("user_profiles").upsert({
          firebase_uid: credential.user.uid,
          name: registerForm.nome,
          username: registerForm.user,
          email: registerForm.email,
          phone: registerForm.phone,
          document: registerForm.doc,
          account_type: accountType,
          photo_url: "",
          updated_at: new Date().toISOString(),
        });

        if (error) {
          throw new Error(error.message);
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("alertRegisterError");
      notify(`${t("alertRegisterError")}: ${message}`, "error");
      return;
    }

    await signOut(auth);
    setUser(null);
    setUserData(null);
    setAuthVisible(true);
    notify(t("verifyEmailSent"), "success");
    setAuthMode("login");
    setRegisterForm(defaultRegisterForm);
  }

  async function handleLogin() {
    if (!isFirebaseConfigured || !auth || !db) {
      const localUserData = readStorage<UserData | null>("usuario_logado", null) ?? {
        nome: loginEmail.split("@")[0] || t("userMenuAccount"),
        user: loginEmail.split("@")[0] || "usuario",
        email: loginEmail,
      };
      setUserData(localUserData);
      setAuthVisible(false);
      setLoginEmail("");
      setLoginPassword("");
      return;
    }

    try {
      const credential = await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      await credential.user.reload();
      if (!credential.user.emailVerified) {
        try {
          await sendEmailVerification(credential.user);
        } catch {
          notify(t("verifyEmailSendError"), "error");
        }
        await signOut(auth);
        setUser(null);
        setUserData(null);
        setAuthVisible(true);
        notify(t("verifyEmailRequired"), "info");
        return;
      }
      const userRef = doc(db, "users", credential.user.uid);
      const userSnapshot = await getDoc(userRef);
      const userDoc = userSnapshot.exists() ? userSnapshot.data() : {};
      let postgresProfile: Record<string, unknown> | null = null;

      if (isSupabaseConfigured && supabase) {
        const { data } = await supabase
          .from("user_profiles")
          .select("*")
          .eq("firebase_uid", credential.user.uid)
          .maybeSingle();
        postgresProfile = data as Record<string, unknown> | null;
      }

      setUser(credential.user);
      setUserData({
        nome: String(postgresProfile?.name ?? userDoc.nome ?? credential.user.displayName ?? credential.user.email ?? t("userMenuAccount")),
        user: String(postgresProfile?.username ?? userDoc.user ?? credential.user.email?.split("@")[0] ?? "usuario"),
        email: String(postgresProfile?.email ?? credential.user.email ?? ""),
        phone: String(postgresProfile?.phone ?? userDoc.phone ?? ""),
        doc: String(postgresProfile?.document ?? userDoc.doc ?? ""),
        type: (String(postgresProfile?.account_type ?? userDoc.type ?? "PF") === "PJ" ? "PJ" : "PF") as AccountType,
        photoURL: String(postgresProfile?.photo_url ?? userDoc.photoURL ?? credential.user.photoURL ?? ""),
      });
      setAuthVisible(false);
      setLoginEmail("");
      setLoginPassword("");
      await loadAccounts(credential.user);
    } catch {
      notify(t("alertLoginError"), "error");
    }
  }

  async function handleLogout() {
    if (isFirebaseConfigured && auth) {
      await signOut(auth);
    }
    setUser(null);
    setUserData(null);
    setAuthVisible(true);
    setUserMenuOpen(false);
    setProfileModalOpen(false);
  }

  function openProfileModal() {
    const nextProfile = {
      nome: userData?.nome ?? user?.displayName ?? "",
      user: userData?.user ?? user?.email?.split("@")[0] ?? "",
      email: userData?.email ?? user?.email ?? "",
      phone: userData?.phone ?? "",
      doc: userData?.doc ?? "",
      type: userData?.type ?? "PF",
      photoURL: userData?.photoURL ?? user?.photoURL ?? "",
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    };
    setProfileForm(nextProfile);
    setProfilePhotoFile(null);
    setProfileSaving(false);
    setUserMenuOpen(false);
    setProfileModalOpen(true);
  }

  async function handleSaveProfile() {
    if (profileSaving) return;

    const nextUserData: UserData = {
      nome: profileForm.nome.trim(),
      user: profileForm.user.trim(),
      email: profileForm.email.trim(),
      phone: profileForm.phone,
      doc: profileForm.doc,
      type: profileForm.type,
      photoURL: profileForm.photoURL,
    };

    if (!nextUserData.nome || !nextUserData.user || !nextUserData.email) {
      notify(t("alertRequiredRegister"), "error");
      return;
    }

    if (profileForm.newPassword || profileForm.confirmPassword) {
      if (profileForm.newPassword !== profileForm.confirmPassword) {
        notify(t("alertPasswordMismatch"), "error");
        return;
      }
    }

    setProfileSaving(true);

    try {
      if (isFirebaseConfigured && user && db) {
        if (profilePhotoFile && storage) {
          try {
            const extension = profilePhotoFile.name.split(".").pop() || "jpg";
            const photoRef = ref(
              storage,
              `users/${user.uid}/profile.${extension.toLowerCase()}`,
            );
            await uploadBytes(photoRef, profilePhotoFile, {
              contentType: profilePhotoFile.type,
            });
            nextUserData.photoURL = await getDownloadURL(photoRef);
          } catch {
            notify(t("profilePhotoUploadFailed"), "error");
            nextUserData.photoURL = userData?.photoURL ?? "";
          }
        } else if (profilePhotoFile) {
          notify(t("profilePhotoUploadFailed"), "error");
          nextUserData.photoURL = userData?.photoURL ?? "";
        }

        if (auth?.currentUser) {
          const emailChanged =
            !!nextUserData.email &&
            !!auth.currentUser.email &&
            nextUserData.email !== auth.currentUser.email;
          const passwordChanged = !!profileForm.newPassword;

          await updateProfile(auth.currentUser, {
            displayName: nextUserData.nome,
            photoURL: (nextUserData.photoURL ?? "").startsWith("data:")
              ? null
              : nextUserData.photoURL || null,
          });

          if ((emailChanged || passwordChanged) && profileForm.currentPassword) {
            const credential = EmailAuthProvider.credential(
              auth.currentUser.email ?? nextUserData.email,
              profileForm.currentPassword,
            );
            await reauthenticateWithCredential(auth.currentUser, credential);
          }

          if (emailChanged) {
            try {
              await updateEmail(auth.currentUser, nextUserData.email);
            } catch {
              notify(t("profilePasswordRecentLogin"), "error");
              return;
            }
          }

          if (passwordChanged) {
            try {
              await updatePassword(auth.currentUser, profileForm.newPassword);
            } catch {
              notify(t("profilePasswordRecentLogin"), "error");
              return;
            }
          }
        }

        await setDoc(
          doc(db, "users", user.uid),
          {
            nome: nextUserData.nome,
            user: nextUserData.user,
            email: nextUserData.email,
            phone: nextUserData.phone,
            doc: nextUserData.doc,
            type: nextUserData.type,
            photoURL: nextUserData.photoURL,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      }

      if (isSupabaseConfigured && supabase && user) {
        const { error } = await supabase.from("user_profiles").upsert({
          firebase_uid: user.uid,
          name: nextUserData.nome,
          username: nextUserData.user,
          email: nextUserData.email,
          phone: nextUserData.phone,
          document: nextUserData.doc,
          account_type: nextUserData.type,
          photo_url: nextUserData.photoURL,
          updated_at: new Date().toISOString(),
        });

        if (error) {
          throw new Error(error.message);
        }
      }

      setUserData(nextUserData);
      setProfilePhotoFile(null);
      setProfileModalOpen(false);
      notify(t("profileSaved"), "success");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("alertSaveError");
      notify(`${t("alertSaveError")}: ${message}`, "error");
    } finally {
      setProfileSaving(false);
    }
  }

  function handleProfilePhotoChange(file: File | undefined) {
    if (!file) return;
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      notify(t("profilePhotoInvalid"), "error");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      notify(t("profilePhotoTooLarge"), "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      setProfilePhotoFile(file);
      setProfileForm((prev) => ({ ...prev, photoURL: result }));
    };
    reader.readAsDataURL(file);
  }

  function handleSelectSidebarAccount(account: LilyAccount) {
    applyAccountToForm(account);
    setSidebarOpen(false);
    setView("home");
  }

  async function handleDeleteAccount(id: number) {
    if (!window.confirm(t("alertDeleteConfirm"))) return;

    const current = accounts.find((item) => item.id === id);
    if (isSupabaseConfigured && supabase && user) {
      const { error } = await supabase
        .from("accounts")
        .delete()
        .eq("firebase_uid", user.uid)
        .eq("id", id);

      if (error) {
        notify(`${t("alertDeleteError")}: ${error.message}`, "error");
        return;
      }
    } else
      if (isFirebaseConfigured && db && current?.docId) {
        try {
          await deleteDoc(doc(db, "accounts", current.docId));
        } catch (error) {
          const message =
            error instanceof Error ? error.message : t("alertDeleteError");
          notify(`${t("alertDeleteError")}: ${message}`, "error");
          return;
        }
      }

    setAccounts((prev) => prev.filter((item) => item.id !== id));
    if (selectedAccountId === id) {
      setSelectedAccountId(null);
      setResults(null);
    }
  }

  async function handleSaveAccount() {
    if (!accountForm.marca || !accountForm.veiculo || !accountForm.tipoPeca) {
      notify(t("alertAccountRequired"), "error");
      return;
    }

    if (isFirebaseConfigured && !user) {
      notify(t("alertUserNotLogged"), "error");
      return;
    }

    const computedResults =
      results ?? calculateResults(mainInputs, isBlueMode, config.valorHora || 40);
    const venda = computedResults.mv ?? computedResults.venda;

    const selectedClient = config.clientes.find(
      (client) => String(client.id) === accountForm.clienteSelect,
    );

    const payload = {
      id: selectedAccountId ?? Date.now(),
      user_id: user?.uid ?? "local-user",
      marca: accountForm.marca,
      veiculo: accountForm.veiculo,
      tipo_peca: accountForm.tipoPeca,
      cliente_nome:
        accountForm.tipoProprietario === "cliente"
          ? selectedClient?.nome || accountForm.clienteTelefone
          : "",
      data: new Date().toISOString(),
      modo: isBlueMode,
      vinicial: mainInputs.vInicial,
      frete: mainInputs.frete,
      func: mainInputs.func,
      material: mainInputs.material,
      horas: mainInputs.horas,
      inss: mainInputs.inss,
      vendido_por: accountForm.vendidoPorInput,
      mao_de_obra: accountForm.maoDeObraInput,
      total: venda,
    };

    const existingAccount = accounts.find((item) => item.id === selectedAccountId);

    let mapped: LilyAccount;

    if (isSupabaseConfigured && supabase && user) {
      const postgresPayload = accountToPostgresPayload(payload, user.uid);
      const { data, error } = await supabase
        .from("accounts")
        .upsert(postgresPayload)
        .select()
        .single();

      if (error) {
        notify(`${t("alertSaveError")}: ${error.message}`, "error");
        return;
      }

      mapped = mapPostgresAccount(data as Record<string, unknown>);
    } else if (isFirebaseConfigured && db) {
      try {
        if (existingAccount?.docId) {
          await updateDoc(doc(db, "accounts", existingAccount.docId), payload);
          mapped = {
            ...mapSupabaseAccount(payload as unknown as Record<string, unknown>),
            docId: existingAccount.docId,
          };
        } else {
          const created = await addDoc(collection(db, "accounts"), {
            ...payload,
            createdAt: serverTimestamp(),
          });
          mapped = {
            ...mapSupabaseAccount(payload as unknown as Record<string, unknown>),
            docId: created.id,
          };
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : t("alertSaveError");
        notify(`${t("alertSaveError")}: ${message}`, "error");
        return;
      }
    } else {
      mapped = mapSupabaseAccount(payload as unknown as Record<string, unknown>);
    }

    setAccounts((prev) =>
      existingAccount
        ? prev.map((item) => (item.id === existingAccount.id ? mapped : item))
        : [mapped, ...prev],
    );
    setSelectedAccountId(mapped.id);
    setResults(computedResults);
    setAccountModalOpen(false);
    notify(existingAccount ? t("alertAccountUpdated") : t("alertAccountSaved"), "success");
  }

  function addPiece() {
    const piece = newPiece.trim();
    if (!piece) return;
    setConfig((prev) => ({ ...prev, pecas: [...prev.pecas, piece] }));
    setNewPiece("");
  }

  function removePiece(index: number) {
    setConfig((prev) => ({
      ...prev,
      pecas: prev.pecas.filter((_item, currentIndex) => currentIndex !== index),
    }));
  }

  function addClient() {
    const nome = clientType === "PF" ? clientForm.nome : clientForm.razaoSocial;
    const doc = clientType === "PF" ? clientForm.cpf : clientForm.cnpj;
    if (!nome || !doc) {
      notify(t("alertClientRequired"), "error");
      return;
    }

    const client: Client = {
      id: Date.now(),
      tipo: clientType,
      nome,
      apelido: clientForm.apelido,
      fantasia: clientForm.nomeFantasia,
      doc,
      tel: clientForm.tel,
      email: clientForm.email,
      endereco: clientForm.endereco,
      ie: clientForm.inscEstadual,
    };

    setConfig((prev) => ({ ...prev, clientes: [...prev.clientes, client] }));
    setClientForm({
      nome: "",
      apelido: "",
      cpf: "",
      razaoSocial: "",
      nomeFantasia: "",
      cnpj: "",
      inscEstadual: "",
      tel: "",
      email: "",
      endereco: "",
    });
  }

  function removeClient(id: number) {
    if (!window.confirm(t("alertRemoveClient"))) return;
    setConfig((prev) => ({
      ...prev,
      clientes: prev.clientes.filter((client) => client.id !== id),
    }));
  }

  const filteredSidebarAccounts = accounts.filter(
    (account) => account.modo === isBlueMode,
  );

  const visibleAccounts = accounts.filter((account) => {
    const matchesMode = account.modo === isBlueMode;
    const matchesSearch =
      account.veiculo.toLowerCase().includes(accountsSearch.toLowerCase()) ||
      account.clienteNome.toLowerCase().includes(accountsSearch.toLowerCase());
    const matchesBrand =
      !accountsBrandFilter || account.marca === accountsBrandFilter;
    return matchesMode && matchesSearch && matchesBrand;
  });

  const selectedAccount = accounts.find((account) => account.id === selectedAccountId);
  const accountModalTitle = selectedAccount ? t("editAccount") : t("registerAccount");
  const accountSaveLabel = selectedAccount ? t("update") : t("confirm");

  return (
    <div className={isBlueMode ? "app-shell azul" : "app-shell"}>
      <Toasts messages={toasts} />

      <div className="legacy-user-menu" style={{ display: "none" }}>
        <span>{userData?.user ?? t("userMenuAccount")}</span>
        <UserAvatar initial={userInitial} photoURL={displayPhoto} />
      </div>

      {!authVisible && (
        <div className="user-menu">
          <button
            className="user-menu-trigger"
            type="button"
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
            onClick={() => setUserMenuOpen((prev) => !prev)}
          >
            <UserAvatar initial={userInitial} photoURL={displayPhoto} />
            <div className="user-menu-copy">
              <strong>{displayName}</strong>
              <span>{displayEmail}</span>
            </div>
            <span className="user-menu-chevron">⌄</span>
          </button>

          {userMenuOpen && (
            <div className="user-dropdown" role="menu">
              <div className="user-dropdown-header">
                <UserAvatar
                  initial={userInitial}
                  photoURL={displayPhoto}
                  className="large"
                />
                <div>
                  <strong>{displayName}</strong>
                  <span>{displayEmail}</span>
                </div>
              </div>

              <button type="button" role="menuitem" onClick={openProfileModal}>
                <span>👤</span>
                {t("userMenuProfile")}
              </button>

              <div className="user-dropdown-group">
                <span className="user-dropdown-label">{t("userMenuLanguage")}</span>
                <div className="language-switcher">
                  <button
                    type="button"
                    className={locale === "pt-BR" ? "is-active" : ""}
                    onClick={() => setLocale("pt-BR")}
                  >
                    PT
                  </button>
                  <button
                    type="button"
                    className={locale === "en-US" ? "is-active" : ""}
                    onClick={() => setLocale("en-US")}
                  >
                    EN
                  </button>
                </div>
              </div>

              <button
                type="button"
                role="menuitem"
                className="logout-menu-item"
                onClick={() => void handleLogout()}
              >
                <span>↪</span>
                {t("userMenuLogout")}
              </button>
            </div>
          )}
        </div>
      )}

      {authVisible && (
        <div id="auth-screen">
          <div className="auth-card auth-shell">
            <section className="auth-hero">
              <div className="auth-badge">{t("authBadge")}</div>
              <h1 className="brand-title">L.I.L.Y</h1>
              <p className="auth-hero-text">{t("authHeroText")}</p>
              <div className="auth-highlights">
                <div className="auth-highlight-card">
                  <strong>{t("authHighlightControlTitle")}</strong>
                  <span>{t("authHighlightControlText")}</span>
                </div>
                <div className="auth-highlight-card">
                  <strong>{t("authHighlightSpeedTitle")}</strong>
                  <span>{t("authHighlightSpeedText")}</span>
                </div>
              </div>
            </section>

            <section
              className={
                authMode === "register"
                  ? "auth-panel auth-panel-register"
                  : "auth-panel"
              }
            >
              <div className="auth-panel-header">
                <span className="auth-kicker">
                  {authMode === "login" ? t("authLoginKicker") : t("authRegisterKicker")}
                </span>
                <h2>{authMode === "login" ? t("authLoginTitle") : t("authRegisterTitle")}</h2>
                <p>
                  {authMode === "login"
                    ? t("authLoginSubtitle")
                    : t("authRegisterSubtitle")}
                </p>
              </div>

              {authMode === "login" ? (
                <form
                  className="auth-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleLogin();
                  }}
                >
                  <div className="auth-field">
                    <label htmlFor="login-email">{t("email")}</label>
                    <input
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      required
                      placeholder={t("loginEmailPlaceholder")}
                      value={loginEmail}
                      onChange={(event) => setLoginEmail(event.target.value)}
                    />
                  </div>
                  <div className="auth-field">
                    <label htmlFor="login-password">{t("password")}</label>
                    <input
                      id="login-password"
                      type="password"
                      autoComplete="current-password"
                      required
                      placeholder={t("passwordPlaceholder")}
                      value={loginPassword}
                      onChange={(event) => setLoginPassword(event.target.value)}
                    />
                  </div>
                  <button className="auth-submit" type="submit">
                    {t("loginSubmit")}
                  </button>
                  <p className="auth-switch-copy">
                    {t("noAccount")}
                    <button
                      className="auth-toggle"
                      type="button"
                      onClick={() => setAuthMode("register")}
                    >
                      {t("createRegistration")}
                    </button>
                  </p>
                </form>
              ) : (
                <form
                  className="auth-form auth-register-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleRegister();
                  }}
                >
                  <div className="account-type-switch">
                    <button
                      type="button"
                      aria-pressed={accountType === "PF"}
                      className={accountType === "PF" ? "is-active" : ""}
                      onClick={() => setAccountType("PF")}
                    >
                      {t("personPf")}
                    </button>
                    <button
                      type="button"
                      aria-pressed={accountType === "PJ"}
                      className={accountType === "PJ" ? "is-active" : ""}
                      onClick={() => setAccountType("PJ")}
                    >
                      {t("personPj")}
                    </button>
                  </div>

                  <div className="register-grid">
                    <div className="auth-field span-two register-name-field">
                      <label htmlFor="register-name">{t("profileName")}</label>
                      <input
                        id="register-name"
                        type="text"
                        autoComplete="name"
                        required
                        placeholder={t("registerNamePlaceholder")}
                        value={registerForm.nome}
                        onChange={(event) =>
                          setRegisterForm((prev) => ({
                            ...prev,
                            nome: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="auth-field register-email-field">
                      <label htmlFor="register-email">{t("email")}</label>
                      <input
                        id="register-email"
                        type="email"
                        autoComplete="email"
                        required
                        placeholder={t("registerEmailPlaceholder")}
                        value={registerForm.email}
                        onChange={(event) =>
                          setRegisterForm((prev) => ({
                            ...prev,
                            email: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="auth-field register-doc-field">
                      <label htmlFor="register-doc">
                        {accountType === "PF" ? "CPF" : "CNPJ"}
                      </label>
                      <input
                        id="register-doc"
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder={accountType === "PF" ? "000.000.000-00" : "00.000.000/0000-00"}
                        value={registerForm.doc}
                        onChange={(event) =>
                          setRegisterForm((prev) => ({
                            ...prev,
                            doc: formatDoc(event.target.value, accountType),
                          }))
                        }
                      />
                    </div>
                    <div className="auth-field register-phone-field">
                      <label htmlFor="register-phone">{t("phone")}</label>
                      <input
                        id="register-phone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="(00) 00000-0000"
                        value={registerForm.phone}
                        onChange={(event) =>
                          setRegisterForm((prev) => ({
                            ...prev,
                            phone: formatPhone(event.target.value),
                          }))
                        }
                      />
                    </div>
                    <div className="auth-field register-user-field">
                      <label htmlFor="register-user">{t("profileUser")}</label>
                      <input
                        id="register-user"
                        type="text"
                        autoComplete="username"
                        required
                        placeholder={t("registerUserPlaceholder")}
                        value={registerForm.user}
                        onChange={(event) =>
                          setRegisterForm((prev) => ({
                            ...prev,
                            user: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="auth-field span-two register-password-field">
                      <label htmlFor="register-password">{t("password")}</label>
                      <input
                        id="register-password"
                        type="password"
                        autoComplete="new-password"
                        required
                        placeholder={t("registerPasswordPlaceholder")}
                        value={registerForm.pass}
                        onChange={(event) =>
                          setRegisterForm((prev) => ({
                            ...prev,
                            pass: event.target.value,
                          }))
                        }
                      />
                      <div className="strength-track">
                        <div
                          className="strength-bar"
                          style={{
                            width: passwordStrength.width,
                            background: passwordStrength.color,
                          }}
                        />
                      </div>
                      <small className="strength-label">{passwordStrength.label}</small>
                    </div>
                    <div className="auth-field span-two register-confirm-field">
                      <label htmlFor="register-password-confirm">
                        {t("registerConfirmPassword")}
                      </label>
                      <input
                        id="register-password-confirm"
                        type="password"
                        autoComplete="new-password"
                        required
                        placeholder={t("registerConfirmPasswordPlaceholder")}
                        value={registerForm.confirmPass}
                        onChange={(event) =>
                          setRegisterForm((prev) => ({
                            ...prev,
                            confirmPass: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>

                  <label className="terms-row terms-box">
                    <input
                      type="checkbox"
                      checked={registerForm.acceptedTerms}
                      onChange={(event) =>
                        setRegisterForm((prev) => ({
                          ...prev,
                          acceptedTerms: event.target.checked,
                        }))
                      }
                    />
                    <span>
                      {t("termsAcceptPrefix")}{" "}
                      <span
                        className="terms-link"
                        role="button"
                        tabIndex={0}
                        onClick={(event) => {
                          event.preventDefault();
                          setTermsOpen(true);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setTermsOpen(true);
                          }
                        }}
                      >
                        {t("termsUse")}
                      </span>
                      {" "}{t("termsAcceptSuffix")}
                    </span>
                  </label>

                  <button className="auth-submit" type="submit">
                    {t("finishRegistration")}
                  </button>
                  <p className="auth-switch-copy">
                    {t("alreadyAccount")}
                    <button
                      className="auth-toggle"
                      type="button"
                      onClick={() => setAuthMode("login")}
                    >
                      {t("doLogin")}
                    </button>
                  </p>
                </form>
              )}
            </section>
          </div>
        </div>
      )}

      {termsOpen && (
        <div className="modal active">
          <div className="auth-card terms-card">
            <button className="close-modal close-top" onClick={() => setTermsOpen(false)}>
              ×
            </button>
            <h2>{t("termsTitle")}</h2>
            <div className="terms-copy">
              <h3>{t("termsGuide")}</h3>
              <p>
                <strong>{t("termsUseTitle")}</strong> {t("termsUseText")}
              </p>
              <p>
                <strong>{t("termsDataTitle")}</strong> {t("termsDataText")}
              </p>
              <p>
                <strong>{t("termsResponsibilityTitle")}</strong>{" "}
                {t("termsResponsibilityText")}
              </p>
            </div>
            <button onClick={() => setTermsOpen(false)}>
              {t("termsAcceptButton")}
            </button>
          </div>
        </div>
      )}

      {profileModalOpen && (
        <div className="modal active">
          <div className="modal-content profile-modal">
            <button
              className="close-modal close-top"
              type="button"
              onClick={() => setProfileModalOpen(false)}
            >
              ×
            </button>
            <div className="profile-modal-header">
              <UserAvatar
                initial={userInitial}
                photoURL={profileForm.photoURL}
                className="profile-avatar"
              />
              <div>
                <span className="auth-kicker">{t("userMenuAccount")}</span>
                <h2>{t("profileTitle")}</h2>
                <p>{t("profileSubtitle")}</p>
              </div>
            </div>

            <div className="profile-form">
              <section className="profile-section profile-photo-section">
                <div>
                  <h3>{t("profilePhoto")}</h3>
                  <p>{t("profilePhotoHint")}</p>
                </div>
                <div className="profile-photo-controls">
                  <UserAvatar
                    initial={userInitial}
                    photoURL={profileForm.photoURL}
                    className="profile-avatar"
                  />
                  <div className="profile-photo-actions">
                    <label className="file-button">
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(event) =>
                          handleProfilePhotoChange(event.target.files?.[0])
                        }
                      />
                      {t("profileChangePhoto")}
                    </label>
                    {profileForm.photoURL && (
                      <button
                        type="button"
                        className="button-muted"
                        onClick={() => {
                          setProfilePhotoFile(null);
                          setProfileForm((prev) => ({ ...prev, photoURL: "" }));
                        }}
                      >
                        {t("profileRemovePhoto")}
                      </button>
                    )}
                  </div>
                </div>
              </section>

              <section className="profile-section">
                <h3>{t("profileIdentity")}</h3>
                <div className="account-type-switch">
                  <button
                    type="button"
                    className={profileForm.type === "PF" ? "is-active" : ""}
                    onClick={() =>
                      setProfileForm((prev) => ({ ...prev, type: "PF" }))
                    }
                  >
                    {t("personPf")}
                  </button>
                  <button
                    type="button"
                    className={profileForm.type === "PJ" ? "is-active" : ""}
                    onClick={() =>
                      setProfileForm((prev) => ({ ...prev, type: "PJ" }))
                    }
                  >
                    {t("personPj")}
                  </button>
                </div>
                <div className="profile-grid">
                  <label>
                    <span>{t("profileName")}</span>
                    <input
                      type="text"
                      value={profileForm.nome}
                      onChange={(event) =>
                        setProfileForm((prev) => ({
                          ...prev,
                          nome: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span>{profileForm.type === "PF" ? "CPF" : "CNPJ"}</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={profileForm.doc}
                      onChange={(event) =>
                        setProfileForm((prev) => ({
                          ...prev,
                          doc: formatDoc(event.target.value, profileForm.type),
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span>{t("profilePhone")}</span>
                    <input
                      type="tel"
                      inputMode="tel"
                      value={profileForm.phone}
                      onChange={(event) =>
                        setProfileForm((prev) => ({
                          ...prev,
                          phone: formatPhone(event.target.value),
                        }))
                      }
                    />
                  </label>
                </div>
              </section>

              <section className="profile-section">
                <h3>{t("profileAccess")}</h3>
                <div className="profile-grid two">
                  <label>
                    <span>{t("profileUser")}</span>
                    <input
                      type="text"
                      autoComplete="username"
                      value={profileForm.user}
                      onChange={(event) =>
                        setProfileForm((prev) => ({
                          ...prev,
                          user: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span>{t("profileEmail")}</span>
                    <input
                      type="email"
                      autoComplete="email"
                      value={profileForm.email}
                      onChange={(event) =>
                        setProfileForm((prev) => ({
                          ...prev,
                          email: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
                <div className="profile-grid two">
                  <label>
                    <span>{t("profileCurrentPassword")}</span>
                    <input
                      type="password"
                      autoComplete="current-password"
                      placeholder={t("profileCurrentPasswordPlaceholder")}
                      value={profileForm.currentPassword}
                      onChange={(event) =>
                        setProfileForm((prev) => ({
                          ...prev,
                          currentPassword: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span>{t("profileNewPassword")}</span>
                    <input
                      type="password"
                      autoComplete="new-password"
                      placeholder={t("profilePasswordPlaceholder")}
                      value={profileForm.newPassword}
                      onChange={(event) =>
                        setProfileForm((prev) => ({
                          ...prev,
                          newPassword: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
                <div className="profile-grid two">
                  <label>
                    <span>{t("profileConfirmPassword")}</span>
                    <input
                      type="password"
                      autoComplete="new-password"
                      placeholder={t("profilePasswordPlaceholder")}
                      value={profileForm.confirmPassword}
                      onChange={(event) =>
                        setProfileForm((prev) => ({
                          ...prev,
                          confirmPassword: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
              </section>
            </div>

            <div className="modal-buttons">
              {profileSaving && (
                <div className="profile-save-status">
                  {t("profileSavingStatus")}
                </div>
              )}
              <button
                type="button"
                disabled={profileSaving}
                onClick={() => void handleSaveProfile()}
              >
                {profileSaving ? t("profileSaving") : t("profileSave")}
              </button>
              <button
                type="button"
                className="button-muted"
                disabled={profileSaving}
                onClick={() => setProfileModalOpen(false)}
              >
                {t("profileCancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        className={sidebarOpen ? "hamburger active" : "hamburger"}
        onClick={() => setSidebarOpen((prev) => !prev)}
      >
        <span />
        <span />
        <span />
      </button>

      <aside className={sidebarOpen ? "sidebar active" : "sidebar"}>
        <h2>{t("sidebarTitle")}</h2>

        <div className="sidebar-section">
          <button className="marca-btn section-toggle" onClick={() => setView("settings")}>
            {t("settingsPanel")}
          </button>
        </div>

        <div className="sidebar-section">
          <button className="marca-btn section-toggle" onClick={() => setView("accounts")}>
            {t("viewAccounts")}
          </button>

          <div className="submenu">
            <div id="contasList">
              {filteredSidebarAccounts.map((account) => (
                <div
                  key={account.id}
                  className={
                    account.id === selectedAccountId
                      ? "conta-item selected"
                      : "conta-item"
                  }
                  onClick={() => handleSelectSidebarAccount(account)}
                >
                  <div className="conta-item-wrapper">
                    <div>
                      <div className="conta-item-nome">
                        {account.tipoPeca || t("piece")} - {account.veiculo}
                      </div>
                      <div className="conta-item-detalhes">{account.marca}</div>
                      <div className="conta-tipo">
                        {account.clienteNome || t("ourStock")}
                      </div>
                      <div className="conta-data">{formatDate(account.data)}</div>
                    </div>
                    <button
                      className="conta-delete-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleDeleteAccount(account.id);
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="sidebar-footer">
          <button className="marca-btn" onClick={() => void handleLogout()}>
            {t("userMenuLogout")}
          </button>
        </div>
      </aside>

      {view === "home" && (
        <>
          <header>
            <h1>L.I.L.Y</h1>
            <p>{t("appSubtitle")}</p>
            <label className="switch">
              <input
                type="checkbox"
                checked={isBlueMode}
                onChange={(event) => {
                  setIsBlueMode(event.target.checked);
                  setSelectedAccountId(null);
                  setResults(null);
                }}
              />
              <span className="slider" />
            </label>
          </header>

          <main>
            <section
              className={
                lilyAssistantOpen
                  ? "lily-assistant-panel is-open"
                  : "lily-assistant-panel"
              }
              aria-label={t("lilyAssistantTitle")}
            >
              <div className="lily-orbit-stage">
                <button
                  type="button"
                  className={lilyCoreStateClass}
                  aria-label={t("lilyCoreLabel")}
                  onClick={() => setLilyAssistantOpen((prev) => !prev)}
                >
                  <span className="lily-core-ring ring-one" />
                  <span className="lily-core-ring ring-two" />
                  <span className="lily-core-ring ring-three" />
                  <span className="lily-core-grid" />
                  <span className="lily-core-nodes" />
                  <span className="lily-core-scan" />
                  <span className="lily-core-pulse" />
                </button>

                <div className="lily-core-copy">
                  <span className="lily-kicker">{t("lilyCoreLabel")}</span>
                  <h2>{t("lilyAssistantTitle")}</h2>
                  <p>{t("lilyCoreHint")}</p>
                </div>

                <div
                  className={`lily-voice-status lily-voice-${lilyVoiceStatus}`}
                  aria-live="polite"
                >
                  <span>{t("lilyVoice")}</span>
                  <strong>{lilyVoiceLabel}</strong>
                </div>

                {lilyAssistantOpen && (
                  <div className="lily-mode-satellites" aria-label={t("lilyChooseMode")}>
                    <button
                      type="button"
                      className={
                        lilyAssistantMode === "voice"
                          ? "lily-mini is-active"
                          : "lily-mini"
                      }
                      onClick={() => setLilyAssistantMode("voice")}
                    >
                      <span className="lily-mini-orb">V</span>
                      <strong>{t("lilyVoiceMode")}</strong>
                    </button>
                    <button
                      type="button"
                      className={
                        lilyAssistantMode === "chat"
                          ? "lily-mini is-active"
                          : "lily-mini"
                      }
                      onClick={() => setLilyAssistantMode("chat")}
                    >
                      <span className="lily-mini-orb">M</span>
                      <strong>{t("lilyMessageMode")}</strong>
                    </button>
                  </div>
                )}
              </div>

              {lilyAssistantOpen && lilyAssistantMode === "voice" && (
                <div className="lily-voice-console">
                  <div>
                    <span className="lily-kicker">{t("lilyVoiceMode")}</span>
                    <h3>{lilyVoiceLabel}</h3>
                    <p>
                      {isTauriRuntime
                        ? t("lilyVoiceHintActive")
                        : t("lilyVoiceWebHint")}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={
                      lilyVoiceStatus === "active"
                        ? "button-muted"
                        : "lily-primary-action"
                    }
                    disabled={
                      lilyVoiceStatus === "starting" || lilyVoiceStatus === "stopping"
                    }
                    onClick={() => void handleToggleLilyVoice()}
                  >
                    {lilyVoiceStatus === "active"
                      ? t("lilyVoiceStop")
                      : t("lilyVoiceStart")}
                  </button>
                </div>
              )}

              {lilyAssistantOpen && lilyAssistantMode === "chat" && (
                <div className="lily-chat-card">
                  <div className="lily-chat-log" aria-live="polite">
                    {lilyChatMessages.map((message) => (
                      <div
                        key={message.id}
                        className={`lily-chat-message lily-chat-${message.author}`}
                      >
                        <span>{message.author === "lily" ? "L.I.L.Y" : displayName}</span>
                        <p>{message.text}</p>
                      </div>
                    ))}
                    {lilyChatBusy && (
                      <div className="lily-chat-message lily-chat-lily">
                        <span>L.I.L.Y</span>
                        <p>{t("lilyChatThinking")}</p>
                      </div>
                    )}
                  </div>

                  <div className="lily-chat-input">
                    <input
                      type="text"
                      value={lilyChatInput}
                      placeholder={t("lilyChatPlaceholder")}
                      onChange={(event) => setLilyChatInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void handleSendLilyChat();
                        }
                      }}
                    />
                    <button
                      type="button"
                      disabled={lilyChatBusy || !lilyChatInput.trim()}
                      onClick={() => void handleSendLilyChat()}
                    >
                      {t("lilyChatSend")}
                    </button>
                  </div>
                </div>
              )}
            </section>

            <div className="inputs">
              <FloatingInput
                id="vInicial"
                label={t("initialValue")}
                value={mainInputs.vInicial}
                onChange={(value) =>
                  setMainInputs((prev) => ({ ...prev, vInicial: value }))
                }
              />
              <FloatingInput
                id="frete"
                label={t("freight")}
                value={mainInputs.frete}
                onChange={(value) =>
                  setMainInputs((prev) => ({ ...prev, frete: value }))
                }
              />
              <FloatingInput
                id="func"
                label={t("employee")}
                value={mainInputs.func}
                onChange={(value) =>
                  setMainInputs((prev) => ({ ...prev, func: value }))
                }
              />
              {isBlueMode && (
                <>
                  <FloatingInput
                    id="material"
                    label={t("material")}
                    value={mainInputs.material}
                    onChange={(value) =>
                      setMainInputs((prev) => ({ ...prev, material: value }))
                    }
                  />
                  <FloatingInput
                    id="horas"
                    label={t("serviceHours")}
                    value={mainInputs.horas}
                    onChange={(value) =>
                      setMainInputs((prev) => ({ ...prev, horas: value }))
                    }
                  />
                  <FloatingInput
                    id="inss"
                    label="INSS (R$)"
                    value={mainInputs.inss}
                    onChange={(value) =>
                      setMainInputs((prev) => ({ ...prev, inss: value }))
                    }
                  />
                </>
              )}
            </div>

            <div className="actions-grid">
              <button onClick={handleCalculate}>{t("calculate")}</button>
              <button className="button-muted" onClick={handleNewAccount}>
                {t("newAccount")}
              </button>
              <button onClick={() => setAccountModalOpen(true)}>
                {selectedAccount ? t("editAccount") : t("registerAccount")}
              </button>
              <button id="resetar" onClick={handleReset}>
                {t("clear")}
              </button>
            </div>

            {results && (
              <div className="resultado">
                <h3>{isBlueMode ? t("blueResult") : t("yellowResult")}</h3>
                <ResultRow label={t("sellFor")} value={formatCurrency(results.venda)} />
                {selectedAccount?.vendidoPor && (
                  <ResultRow
                    label={t("soldFor")}
                    value={formatCurrency(toNumber(selectedAccount.vendidoPor))}
                  />
                )}
                {selectedAccount?.maoDeObra && (
                  <ResultRow
                    label={t("labor")}
                    value={formatCurrency(toNumber(selectedAccount.maoDeObra))}
                  />
                )}
                <ResultRow label={t("cost")} value={formatCurrency(results.custo)} />
                <ResultRow
                  label={t("finalProfit")}
                  value={formatCurrency(results.lucro)}
                  strong
                />
                {isBlueMode && results.montagem !== undefined && (
                  <>
                    <ResultRow
                      label={t("assembly")}
                      value={formatCurrency(results.montagem)}
                    />
                    <ResultRow
                      label={t("coreAssembly")}
                      value={formatCurrency(results.cm ?? 0)}
                    />
                    <ResultRow
                      label={t("assemblySale")}
                      value={formatCurrency(results.mv ?? 0)}
                    />
                  </>
                )}
              </div>
            )}
          </main>
        </>
      )}

      {view === "settings" && (
        <section className="page-shell">
          <div className="container narrow">
            <header className="page-header simple">
              <button className="btn-voltar" onClick={() => setView("home")}>
                ← {t("back")}
              </button>
              <h1>{t("settings")}</h1>
            </header>

            <div className="grid-settings">
              <div className="card" onClick={() => setSettingsModal("hora")}>
                <i>⏱</i>
                <h3>{t("hourlyValue")}</h3>
                <p>{t("hourlyValueDesc")}</p>
              </div>
              <div className="card" onClick={() => setSettingsModal("pecas")}>
                <i>📦</i>
                <h3>{t("pieceTypes")}</h3>
                <p>{t("pieceTypesDesc")}</p>
              </div>
              <div className="card" onClick={() => setSettingsModal("clientes")}>
                <i>👤</i>
                <h3>{t("clients")}</h3>
                <p>{t("clientsDesc")}</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {view === "accounts" && (
        <section className="page-shell">
          <div className="container narrow">
            <header className="accounts-header">
              <div className="header-top">
                <button className="btn-voltar btn-link" onClick={() => setView("home")}>
                  ← {t("back")}
                </button>
                <h1>{t("registeredAccounts")}</h1>
                <div className="header-spacer" />
              </div>

              <div className="modo-container">
                <small>{t("yellow")}</small>
                <label className="switch compact">
                  <input
                    type="checkbox"
                    checked={isBlueMode}
                    onChange={(event) => setIsBlueMode(event.target.checked)}
                  />
                  <span className="slider" />
                </label>
                <small>{t("blue")}</small>
              </div>
            </header>

            <div className="filtros-container">
              <input
                type="text"
                placeholder={t("searchVehicleClient")}
                value={accountsSearch}
                onChange={(event) => setAccountsSearch(event.target.value)}
              />
              <select
                value={accountsBrandFilter}
                onChange={(event) => setAccountsBrandFilter(event.target.value)}
              >
                <option value="">{t("allBrands")}</option>
                {marcas.map((marca) => (
                  <option key={marca} value={marca}>
                    {marca}
                  </option>
                ))}
              </select>
            </div>

            <div>
              {visibleAccounts.length === 0 ? (
                <p className="empty-state">{t("emptyAccounts")}</p>
              ) : (
                visibleAccounts.map((account) => (
                  <div key={account.id} className="conta-card">
                    <div className="info">
                      <h3>
                        {account.veiculo || t("noVehicle")} -{" "}
                        {account.marca || t("general")}
                      </h3>
                      <p>
                        <strong>{t("piece")}:</strong>{" "}
                        {account.tipoPeca || t("notInformed")} |{" "}
                        <strong>{t("singleClient")}:</strong>{" "}
                        {account.clienteNome || t("walkIn")}
                      </p>
                      <p>
                        <small>{formatDate(account.data)}</small>
                      </p>
                    </div>
                    <div className="actions">
                      <div className="valor-tag">{formatCurrency(account.total)}</div>
                      <button
                        className="btn-edit"
                        onClick={() => {
                          handleSelectSidebarAccount(account);
                          setAccountModalOpen(true);
                        }}
                      >
                        ✎
                      </button>
                      <button
                        className="btn-del"
                        onClick={() => void handleDeleteAccount(account.id)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      )}

      {accountModalOpen && (
        <div className="modal active">
          <div className="modal-content account-modal">
            <div className="account-modal-header">
              <div>
                <span>{selectedAccount ? t("editAccount") : t("newAccount")}</span>
                <h2>{accountModalTitle}</h2>
              </div>
              <button
                className="close-modal"
                onClick={() => {
                  setAccountModalOpen(false);
                }}
                aria-label={t("cancel")}
              >
                ×
              </button>
            </div>

            <div className="account-modal-grid">
              <section className="account-image-panel">
                <div>
                  <h3>{t("accountImageTitle")}</h3>
                  <p>{t("accountImageSubtitle")}</p>
                </div>

                <div className="account-image-preview">
                  {accountImagePreview ? (
                    <img src={accountImagePreview} alt={accountImageFileName} />
                  ) : (
                    <span>{t("accountImagePlaceholder")}</span>
                  )}
                </div>

                <div className="account-image-status">{accountImageStatusText}</div>

                <div className="account-image-actions">
                  <label className="file-button account-image-button">
                    {t("accountImageUpload")}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => {
                        handleAccountImageFile(event.target.files?.[0]);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                  <label className="file-button account-image-button secondary">
                    {t("accountImageCapture")}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      capture="environment"
                      onChange={(event) => {
                        handleAccountImageFile(event.target.files?.[0]);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                  <button
                    className="account-image-button"
                    disabled={!accountImagePreview || accountImageStatus === "analyzing"}
                    onClick={applyAccountImageRecognition}
                  >
                    {t("accountImageAnalyze")}
                  </button>
                  {accountImagePreview && (
                    <button
                      className="account-image-button button-muted"
                      onClick={clearAccountImage}
                    >
                      {t("accountImageRemove")}
                    </button>
                  )}
                </div>
              </section>

              <div className="account-form-panel">
                <section className="account-form-section">
                  <h3>{t("accountDataSection")}</h3>
                  <div className="account-form-grid">
                    <select
                      value={accountForm.marca}
                      onChange={(event) =>
                        setAccountForm((prev) => ({ ...prev, marca: event.target.value }))
                      }
                    >
                      <option value="">{t("selectBrand")}</option>
                      {marcas.map((marca) => (
                        <option key={marca} value={marca}>
                          {marca}
                        </option>
                      ))}
                    </select>

                    <input
                      type="text"
                      placeholder={t("vehicleName")}
                      value={accountForm.veiculo}
                      onChange={(event) =>
                        setAccountForm((prev) => ({ ...prev, veiculo: event.target.value }))
                      }
                    />

                    <select
                      value={accountForm.tipoPeca}
                      onChange={(event) =>
                        setAccountForm((prev) => ({ ...prev, tipoPeca: event.target.value }))
                      }
                    >
                      <option value="">{t("selectPieceType")}</option>
                      {config.pecas.map((piece) => (
                        <option key={piece} value={piece}>
                          {piece}
                        </option>
                      ))}
                    </select>
                  </div>
                </section>

                <section className="account-form-section">
                  <h3>{t("accountOwnerSection")}</h3>
                  <div className="tipo-proprietario">
                    <label>
                      <input
                        type="radio"
                        name="tipoProprietario"
                        checked={accountForm.tipoProprietario === "estoque"}
                        onChange={() =>
                          setAccountForm((prev) => ({
                            ...prev,
                            tipoProprietario: "estoque",
                          }))
                        }
                      />
                      {t("ourStock")}
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="tipoProprietario"
                        checked={accountForm.tipoProprietario === "cliente"}
                        onChange={() =>
                          setAccountForm((prev) => ({
                            ...prev,
                            tipoProprietario: "cliente",
                          }))
                        }
                      />
                      {t("singleClient")}
                    </label>
                  </div>

                  {accountForm.tipoProprietario === "cliente" && (
                    <div className="account-form-grid two">
                      <select
                        value={accountForm.clienteSelect}
                        onChange={(event) =>
                          setAccountForm((prev) => ({
                            ...prev,
                            clienteSelect: event.target.value,
                          }))
                        }
                      >
                        <option value="">{t("selectRegisteredClient")}</option>
                        {config.clientes.map((client) => (
                          <option key={client.id} value={client.id}>
                            {client.nome} ({client.tipo})
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder={t("clientPhone")}
                        value={accountForm.clienteTelefone}
                        onChange={(event) =>
                          setAccountForm((prev) => ({
                            ...prev,
                            clienteTelefone: formatPhone(event.target.value),
                          }))
                        }
                      />
                    </div>
                  )}
                </section>

                <section className="account-form-section">
                  <h3>{t("accountValuesSection")}</h3>
                  <div className="account-form-grid two">
                    <input
                      type="text"
                      placeholder={t("soldByValue")}
                      value={accountForm.vendidoPorInput}
                      onChange={(event) =>
                        setAccountForm((prev) => ({
                          ...prev,
                          vendidoPorInput: event.target.value,
                        }))
                      }
                    />

                    <input
                      type="text"
                      placeholder={t("laborValue")}
                      value={accountForm.maoDeObraInput}
                      onChange={(event) =>
                        setAccountForm((prev) => ({
                          ...prev,
                          maoDeObraInput: event.target.value,
                        }))
                      }
                    />
                  </div>
                </section>
              </div>
            </div>

            <div className="modal-buttons account-modal-actions">
              <button onClick={() => void handleSaveAccount()}>{accountSaveLabel}</button>
              <button
                className="button-muted"
                onClick={() => {
                  setAccountModalOpen(false);
                }}
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {settingsModal === "hora" && (
        <OverlayModal title={t("hourlyValue")} onClose={() => setSettingsModal(null)}>
          <input
            type="text"
            value={String(config.valorHora)}
            onChange={(event) =>
              setConfig((prev) => ({
                ...prev,
                valorHora: toNumber(event.target.value),
              }))
            }
            placeholder={t("hourlyPlaceholder")}
          />
          <button onClick={() => setSettingsModal(null)}>{t("save")}</button>
        </OverlayModal>
      )}

      {settingsModal === "pecas" && (
        <OverlayModal title={t("managePieces")} onClose={() => setSettingsModal(null)}>
          <input
            type="text"
            placeholder={t("pieceName")}
            value={newPiece}
            onChange={(event) => setNewPiece(event.target.value)}
          />
          <button onClick={addPiece}>{t("addPiece")}</button>
          <div className="data-list">
            {config.pecas.map((piece, index) => (
              <div key={`${piece}-${index}`} className="data-item">
                <span>{piece}</span>
                <button className="btn-del" onClick={() => removePiece(index)}>
                  ×
                </button>
              </div>
            ))}
          </div>
        </OverlayModal>
      )}

      {settingsModal === "clientes" && (
        <OverlayModal title={t("registerClient")} onClose={() => setSettingsModal(null)}>
          <select
            value={clientType}
            onChange={(event) => setClientType(event.target.value as ClientType)}
          >
            <option value="PF">{t("personPf")} (PF)</option>
            <option value="PJ">{t("personPj")} (PJ)</option>
          </select>

          {clientType === "PF" ? (
            <>
              <input
                type="text"
                placeholder={t("fullName")}
                value={clientForm.nome}
                onChange={(event) =>
                  setClientForm((prev) => ({ ...prev, nome: event.target.value }))
                }
              />
              <input
                type="text"
                placeholder={t("nickname")}
                value={clientForm.apelido}
                onChange={(event) =>
                  setClientForm((prev) => ({ ...prev, apelido: event.target.value }))
                }
              />
              <input
                type="text"
                placeholder="CPF"
                value={clientForm.cpf}
                onChange={(event) =>
                  setClientForm((prev) => ({
                    ...prev,
                    cpf: formatCpf(event.target.value),
                  }))
                }
              />
            </>
          ) : (
            <>
              <input
                type="text"
                placeholder={t("companyName")}
                value={clientForm.razaoSocial}
                onChange={(event) =>
                  setClientForm((prev) => ({
                    ...prev,
                    razaoSocial: event.target.value,
                  }))
                }
              />
              <input
                type="text"
                placeholder={t("tradeName")}
                value={clientForm.nomeFantasia}
                onChange={(event) =>
                  setClientForm((prev) => ({
                    ...prev,
                    nomeFantasia: event.target.value,
                  }))
                }
              />
              <input
                type="text"
                placeholder="CNPJ"
                value={clientForm.cnpj}
                onChange={(event) =>
                  setClientForm((prev) => ({
                    ...prev,
                    cnpj: formatCnpj(event.target.value),
                  }))
                }
              />
              <input
                type="text"
                placeholder={t("stateRegistration")}
                value={clientForm.inscEstadual}
                onChange={(event) =>
                  setClientForm((prev) => ({
                    ...prev,
                    inscEstadual: event.target.value,
                  }))
                }
              />
            </>
          )}

          <input
            type="text"
            placeholder={t("phone")}
            value={clientForm.tel}
            onChange={(event) =>
              setClientForm((prev) => ({
                ...prev,
                tel: formatPhone(event.target.value),
              }))
            }
          />
          <input
            type="text"
            placeholder={t("email")}
            value={clientForm.email}
            onChange={(event) =>
              setClientForm((prev) => ({ ...prev, email: event.target.value }))
            }
          />
          <input
            type="text"
            placeholder={t("address")}
            value={clientForm.endereco}
            onChange={(event) =>
              setClientForm((prev) => ({
                ...prev,
                endereco: event.target.value,
              }))
            }
          />

          <button onClick={addClient}>{t("saveClient")}</button>

          <div className="data-list">
            {config.clientes.map((client) => (
              <div key={client.id} className="data-item client-item">
                <div>
                  <strong>{client.nome}</strong>{" "}
                  {client.fantasia ? `(${client.fantasia})` : ""}
                  <div>{t("doc")}: {client.doc}</div>
                  <div>{t("contact")}: {client.tel || t("noPhone")}</div>
                </div>
                <button className="btn-del" onClick={() => removeClient(client.id)}>
                  ×
                </button>
              </div>
            ))}
          </div>
        </OverlayModal>
      )}
    </div>
  );
}

export default App;
