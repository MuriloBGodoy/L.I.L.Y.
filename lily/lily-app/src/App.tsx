import {
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
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

type View = "home" | "settings" | "accounts" | "hourly" | "pieces" | "clients";
type SettingsPage = "hourly" | "pieces" | "clients";
const SETTINGS_PAGES: View[] = ["settings", "hourly", "pieces", "clients"];
const TELA_DA_VIEW: Record<View, string> = {
  home: "inicio",
  accounts: "contas",
  settings: "ajustes",
  hourly: "valorHora",
  pieces: "pecas",
  clients: "clientes",
};
const ROTAS: Record<View, string> = {
  home: "/",
  accounts: "/contas",
  settings: "/ajustes",
  hourly: "/ajustes/valor-hora",
  pieces: "/ajustes/tipos-de-peca",
  clients: "/ajustes/clientes",
};

function viewDaUrl(pathname: string): View | null {
  const caminho = pathname.replace(/\/+$/, "") || "/";
  const achada = (Object.keys(ROTAS) as View[]).find(
    (view) => ROTAS[view] === caminho,
  );
  return achada ?? null;
}
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
  oferta?: "salvar";
};

type LilyAcao = {
  tipo: "calcular" | "salvar" | "modo" | "navegar" | "conta";
  modo?: "padrao" | "avancado";
  destino?: LilyDestino;
  campos?:
    | Partial<Record<keyof MainInputs, number>>
    | Partial<LilyCamposDaConta>;
};
type LilyDestino =
  | "inicio"
  | "calculadora"
  | "contas"
  | "ajustes"
  | "valorHora"
  | "pecas"
  | "clientes";
type LilyCamposDaConta = {
  marca: string;
  veiculo: string;
  peca: string;
  cliente: string;
  proprietario: OwnerType;
  vendidoPor: number;
  maoDeObra: number;
};
type LilyWebResponse = {
  reply?: string;
  audio?: string;
  error?: string;
  acao?: LilyAcao | null;
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

const emptyClientForm = {
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
  clienteSelect: "",
  clienteTelefone: "",
  vendidoPorInput: "",
  maoDeObraInput: "",
};

const LILY_HISTORICO_MAX = 8;

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

function createWelcomeMessages(text: string): LilyChatMessage[] {
  return [{ id: 1, author: "lily", text }];
}

const translations = {
  "pt-BR": {
    appSubtitle: "From Santa Rita Radiadores",
    navCore: "Núcleo",
    navCalc: "Calculadora",
    navAccounts: "Contas",
    navSettings: "Ajustes",
    navMain: "Navegação principal",
    navModeGroup: "Filtro de modo de cálculo",
    modeDialTitle: "Modo de cálculo",
    modeDialKicker: "Configuração",
    modeDialHint:
      "Percorra os setores para ver o que cada modo soma na conta.",
    modeOpen: "Trocar o modo de cálculo",
    modeActiveNow: "Ativo agora",
    modeFields: "campos",
    modeStandardDesc:
      "A conta enxuta: valor inicial, frete e funcionário.",
    modeAdvancedDesc:
      "Soma material, horas de serviço, INSS e a montagem.",
    openUserMenu: "Abrir menu do usuário",
    drawerTitle: "Calculadora de serviço",
    drawerToggle: "Calcular um serviço",
    drawerIdle: "Preencha os valores e toque em calcular",
    drawerModeYellow: "Modo padrão",
    drawerModeBlue: "Modo avançado",
    drawerAccount: "Conta",
    drawerClearAccount: "Limpar conta selecionada",
    finalProfitShort: "lucro final",
    inss: "INSS (R$)",
    accountsKicker: "Registros",
    accountsShowingOne: "conta visível neste modo",
    accountsShowingMany: "contas visíveis neste modo",
    accountsFilterNote:
      "O modo de cálculo é um filtro: as contas do outro modo ficam escondidas.",
    colVehicle: "Veículo / Peça",
    colClient: "Cliente",
    colTotal: "Total",
    selectAccount: "Selecionar conta",
    deleteAccountAction: "Apagar conta",
    emptyAccountsTitle: "Nenhuma conta cadastrada ainda",
    emptyAccountsHint:
      "Calcule um serviço na gaveta do rodapé e use CADASTRAR CONTA para guardar o primeiro registro.",
    noResultsTitle: "Nenhum registro para esse filtro",
    noResultsHint:
      "Tente outro termo de busca, outra marca, ou troque o filtro de modo.",
    loadingAccounts: "Carregando contas...",
    settingsKicker: "Preferências",
    settingsIntro: "Parâmetros que alimentam os cálculos e os cadastros.",
    closeModal: "Fechar",
    loginBusy: "Entrando...",
    registerBusy: "Criando conta...",
    passWeak: "Senha fraca",
    passMedium: "Senha média",
    passStrong: "Senha forte",
    lilyChatWelcome:
      "Opa, estou por aqui. Pode mandar uma mensagem ou ativar minha voz pelo painel.",
    lilyReplyCalc:
      "Abre a gaveta do rodapé, põe os valores e aperta Calcular. Pra guardar, usa Salvar Conta.",
    lilyReplyVoiceDesktop:
      "Pra voz funcionar, ativa o painel e segura ALT enquanto fala comigo.",
    lilyReplyVoiceWeb:
      "Na web eu uso a voz do navegador. Ativa o chat de voz e libera o microfone quando aparecer a permissão.",
    lilyReplyClients:
      "Clientes ficam em Ajustes > Clientes. Depois você consegue vincular no cadastro da conta.",
    lilyReplyDefault:
      "Recebi sua mensagem. Por enquanto este chat está no modo assistente local; quando ligarmos a IA, eu respondo com mais contexto.",
    brandLabel: "Marca",
    vehicleLabel: "Veículo",
    pieceTypeLabel: "Tipo de peça",
    registeredClientLabel: "Cliente cadastrado",
    clientTypeLabel: "Tipo de cliente",
    removePieceAction: "Remover peça",
    removeClientAction: "Remover cliente",
    openTerms: "Ler os termos de uso",
    hourlyFieldLabel: "Valor por hora (R$)",
    accountsSearchLabel: "Buscar",
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
    coreGreetMorning: "Bom dia",
    coreGreetAfternoon: "Boa tarde",
    coreGreetEvening: "Boa noite",
    coreAsk: "No que a gente trabalha agora?",
    startNewService: "Começar um serviço novo",
    newService: "Novo serviço",
    continueWork: "Continuar",
    lilyVoiceMode: "Chat de voz",
    lilyMessageMode: "Chat mensagem",
    lilyChatPlaceholder: "Digite uma mensagem para a L.I.L.Y...",
    lilyChatSend: "Enviar",
    lilyChatThinking: "L.I.L.Y pensando...",
    lilyChatError: "Não consegui responder agora.",
    lilyOfferSave: "Quer registrar essa conta?",
    lilyOfferYes: "Registrar",
    lilyOfferNo: "Agora não",
    engineOffline:
      "A engine de IA não respondeu. Respondendo pelo modo local, mais limitado.",
    lilyPecaNaoEncontrada:
      "Não achei esse tipo de peça no cadastro. Escolha na lista ou cadastre em Ajustes.",
    lilyClienteNaoEncontrado:
      "Não achei esse cliente no cadastro. Escolha na lista ou cadastre em Ajustes.",
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
    forgotPassword: "Esqueci minha senha",
    forgotPasswordNeedEmail: "Digite seu e-mail no campo acima para receber o link de redefinição.",
    forgotPasswordSent:
      "Se existir uma conta com esse e-mail, enviamos um link para redefinir a senha. Confira também o spam.",
    forgotPasswordInvalidEmail: "Esse e-mail não parece válido. Confira e tente de novo.",
    forgotPasswordError: "Não foi possível enviar o link agora. Tente novamente em instantes.",
    forgotPasswordOffline: "A redefinição de senha precisa do Firebase configurado.",
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
    piece: "Peça",
    ourStock: "Estoque Nosso",
    initialValue: "Valor Inicial (R$)",
    freight: "Frete (R$)",
    employee: "Funcionário (R$)",
    material: "Material (R$)",
    serviceHours: "Horas de Serviço",
    calculate: "Calcular",
    newAccount: "Nova Conta",
    saveAccount: "Salvar conta",
    editAccount: "Editar Conta",
    clear: "Limpar",
    yellowResult: "Resultado padrão",
    blueResult: "Resultado avançado",
    sellFor: "Se Vender Por",
    soldFor: "Vendido Por",
    labor: "Mão de Obra",
    cost: "Custo",
    finalProfit: "Lucro Final",
    assembly: "Montagem",
    coreAssembly: "Colmeia + Montagem",
    assemblySale: "Montagem + Venda",
    settings: "Configurações",
    hourlyValue: "Valor da Hora",
    hourlyValueDesc: "Define o custo da mão de obra nos cálculos azul.",
    pieceTypes: "Tipos de Peça",
    pieceTypesDesc: "Gerencie os itens como Radiador, Intercooler e outros.",
    clients: "Clientes",
    clientsDesc: "Cadastre pessoa física ou jurídica.",
    registeredAccounts: "Contas Cadastradas",
    yellow: "PADRÃO",
    blue: "AVANÇADO",
    searchVehicleClient: "Buscar veículo ou cliente...",
    allBrands: "Todas as Marcas",
    emptyAccounts: "Nenhum registro encontrado.",
    noVehicle: "Sem Veículo",
    general: "Geral",
    notInformed: "Não informada",
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
    accountsLoadError: "Não consegui carregar as contas",
    loginDataError: "Entrei, mas não consegui carregar seus dados",
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
      "Insira ou capture uma foto da peça para preencher marca, veículo e tipo.",
    accountImageUpload: "Inserir imagem",
    accountImageCapture: "Capturar",
    accountImageAnalyze: "Reconhecer",
    accountImageRemove: "Remover",
    accountImageEmpty: "Nenhuma imagem selecionada.",
    accountImageReady: "Imagem pronta para análise.",
    accountImageAnalyzing: "Analisando imagem...",
    accountImageDone: "Campos preenchidos com base na imagem.",
    accountImageInvalid: "Escolha uma imagem JPG, PNG ou WEBP.",
    accountImagePlaceholder: "Preview da imagem",
    accountDataSection: "Dados da conta",
    accountOwnerSection: "Proprietário",
    accountValuesSection: "Valores",
    perHourSuffix: "/h",
    pieceTypeOne: "tipo cadastrado",
    pieceTypeMany: "tipos cadastrados",
    clientOne: "cliente",
    clientMany: "clientes",
    accountOne: "conta",
    accountMany: "contas",
    ofTotal: "de",
    hourlyPageIntro:
      "Quanto vale uma hora de trabalho. Entra no custo da mão de obra do cálculo avançado.",
    hourlyCurrent: "Valor salvo",
    discardChanges: "Descartar",
    hourlyExampleKicker: "Como entra na conta",
    hourlyExampleText:
      "No modo avançado, as horas informadas são multiplicadas por este valor. Um serviço de 8 horas fica assim:",
    alertHourlyInvalid: "Informe um valor por hora maior que zero.",
    alertHourlySaved: "Valor da hora atualizado.",
    piecesPageIntro: "aparecem na hora de registrar uma conta.",
    newPiece: "+ Novo tipo",
    newPieceTitle: "Novo tipo de peça",
    editPiece: "Editar tipo de peça",
    piecePlaceholder: "Ex.: Radiador",
    pieceRenameHint:
      "Contas já registradas continuam com o nome antigo; só os próximos registros usam o novo.",
    searchPiece: "Buscar tipo de peça...",
    sortBy: "Ordenar por",
    sortName: "Nome (A–Z)",
    sortUsage: "Mais usados",
    sortRecent: "Mais recentes",
    colPiece: "Tipo de peça",
    colAccounts: "Contas",
    emptyPiecesTitle: "Nenhum tipo de peça cadastrado",
    emptyPiecesHint: "Cadastre os tipos que você mais atende, como Radiador e Intercooler.",
    alertPieceRequired: "Informe o nome do tipo de peça.",
    alertPieceDuplicate: "Já existe um tipo de peça com esse nome.",
    alertPieceSaved: "Tipo de peça cadastrado.",
    alertPieceUpdated: "Tipo de peça atualizado.",
    alertRemovePiece: "Deseja remover este tipo de peça?",
    clientsPageIntro: "pessoas e empresas que você vincula nas contas.",
    newClient: "+ Novo cliente",
    editClient: "Editar cliente",
    searchClient: "Nome, apelido, CPF/CNPJ, telefone...",
    filterAll: "Todos",
    emptyClientsTitle: "Nenhum cliente cadastrado",
    emptyClientsHint: "Cadastre pessoa física ou jurídica para vincular nas contas.",
    alertClientSaved: "Cliente cadastrado.",
    alertClientUpdated: "Cliente atualizado.",
  },
  "en-US": {
    appSubtitle: "From Santa Rita Radiadores",
    navCore: "Core",
    navCalc: "Calculator",
    navAccounts: "Accounts",
    navSettings: "Settings",
    navMain: "Main navigation",
    navModeGroup: "Calculation mode filter",
    modeDialTitle: "Calculation mode",
    modeDialKicker: "Setup",
    modeDialHint: "Sweep the sectors to see what each mode adds to the math.",
    modeOpen: "Change the calculation mode",
    modeActiveNow: "Active now",
    modeFields: "fields",
    modeStandardDesc: "The lean math: initial value, freight and labor.",
    modeAdvancedDesc: "Adds material, service hours, INSS and assembly.",
    openUserMenu: "Open user menu",
    drawerTitle: "Service calculator",
    drawerToggle: "Calculate a service",
    drawerIdle: "Fill in the values and hit calculate",
    drawerModeYellow: "Standard mode",
    drawerModeBlue: "Advanced mode",
    drawerAccount: "Account",
    drawerClearAccount: "Clear selected account",
    finalProfitShort: "final profit",
    inss: "INSS (R$)",
    accountsKicker: "Records",
    accountsShowingOne: "account visible in this mode",
    accountsShowingMany: "accounts visible in this mode",
    accountsFilterNote:
      "The calculation mode is a filter: accounts from the other mode stay hidden.",
    colVehicle: "Vehicle / Part",
    colClient: "Client",
    colTotal: "Total",
    selectAccount: "Select account",
    deleteAccountAction: "Delete account",
    emptyAccountsTitle: "No accounts saved yet",
    emptyAccountsHint:
      "Calculate a service in the bottom drawer and use REGISTER ACCOUNT to save your first record.",
    noResultsTitle: "No records for this filter",
    noResultsHint:
      "Try another search term, another brand, or switch the mode filter.",
    loadingAccounts: "Loading accounts...",
    settingsKicker: "Preferences",
    settingsIntro: "Parameters that feed the calculations and the records.",
    closeModal: "Close",
    loginBusy: "Signing in...",
    registerBusy: "Creating account...",
    passWeak: "Weak password",
    passMedium: "Medium password",
    passStrong: "Strong password",
    lilyChatWelcome:
      "Hey, I am right here. Send me a message or turn my voice on from the panel.",
    lilyReplyCalc:
      "Open the bottom drawer, type the values and hit Calculate. To keep it, use Save Account.",
    lilyReplyVoiceDesktop:
      "For voice to work, turn the panel on and hold ALT while you talk to me.",
    lilyReplyVoiceWeb:
      "On the web I use the browser voice. Start the voice chat and allow the microphone when asked.",
    lilyReplyClients:
      "Clients live in Settings > Clients. After that you can link them when registering an account.",
    lilyReplyDefault:
      "Got your message. This chat is in local assistant mode for now; once the AI is connected I will answer with more context.",
    brandLabel: "Brand",
    vehicleLabel: "Vehicle",
    pieceTypeLabel: "Part type",
    registeredClientLabel: "Registered client",
    clientTypeLabel: "Client type",
    removePieceAction: "Remove part",
    removeClientAction: "Remove client",
    openTerms: "Read the terms of use",
    hourlyFieldLabel: "Hourly value (R$)",
    accountsSearchLabel: "Search",
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
    coreGreetMorning: "Good morning",
    coreGreetAfternoon: "Good afternoon",
    coreGreetEvening: "Good evening",
    coreAsk: "What are we working on?",
    startNewService: "Start a new service",
    newService: "New service",
    continueWork: "Continue",
    lilyVoiceMode: "Voice chat",
    lilyMessageMode: "Message chat",
    lilyChatPlaceholder: "Type a message to L.I.L.Y...",
    lilyChatSend: "Send",
    lilyChatThinking: "L.I.L.Y is thinking...",
    lilyChatError: "I could not answer right now.",
    lilyOfferSave: "Want to save this account?",
    lilyOfferYes: "Save it",
    lilyOfferNo: "Not now",
    engineOffline:
      "The AI engine did not answer. Falling back to the limited local mode.",
    lilyPecaNaoEncontrada:
      "I could not find that part type. Pick it from the list or add it in Settings.",
    lilyClienteNaoEncontrado:
      "I could not find that client. Pick it from the list or add it in Settings.",
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
    forgotPassword: "Forgot my password",
    forgotPasswordNeedEmail: "Type your e-mail in the field above to receive the reset link.",
    forgotPasswordSent:
      "If an account exists for that e-mail, we sent a link to reset the password. Check your spam folder too.",
    forgotPasswordInvalidEmail: "That e-mail doesn't look valid. Check it and try again.",
    forgotPasswordError: "We couldn't send the link right now. Try again in a moment.",
    forgotPasswordOffline: "Password reset requires Firebase to be configured.",
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
    piece: "Part",
    ourStock: "Our Stock",
    initialValue: "Initial Value (R$)",
    freight: "Freight (R$)",
    employee: "Employee (R$)",
    material: "Material (R$)",
    serviceHours: "Service Hours",
    calculate: "Calculate",
    newAccount: "New Account",
    saveAccount: "Save account",
    editAccount: "Edit Account",
    clear: "Clear",
    yellowResult: "Standard result",
    blueResult: "Advanced result",
    sellFor: "Sell For",
    soldFor: "Sold For",
    labor: "Labor",
    cost: "Cost",
    finalProfit: "Final Profit",
    assembly: "Assembly",
    coreAssembly: "Core + Assembly",
    assemblySale: "Assembly + Sale",
    settings: "Settings",
    hourlyValue: "Hourly Value",
    hourlyValueDesc: "Sets labor cost in blue calculations.",
    pieceTypes: "Part Types",
    pieceTypesDesc: "Manage items such as Radiator, Intercooler and more.",
    clients: "Clients",
    clientsDesc: "Register individuals or companies.",
    registeredAccounts: "Registered Accounts",
    yellow: "STANDARD",
    blue: "ADVANCED",
    searchVehicleClient: "Search vehicle or client...",
    allBrands: "All Brands",
    emptyAccounts: "No records found.",
    noVehicle: "No Vehicle",
    general: "General",
    notInformed: "Not informed",
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
    accountsLoadError: "Could not load the accounts",
    loginDataError: "You are in, but I could not load your data",
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
      "Insert or capture a part photo to fill in brand, vehicle and type.",
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
    perHourSuffix: "/h",
    pieceTypeOne: "type registered",
    pieceTypeMany: "types registered",
    clientOne: "client",
    clientMany: "clients",
    accountOne: "account",
    accountMany: "accounts",
    ofTotal: "of",
    hourlyPageIntro:
      "What one hour of work is worth. It feeds labor cost in the advanced calculation.",
    hourlyCurrent: "Saved value",
    discardChanges: "Discard",
    hourlyExampleKicker: "How it is used",
    hourlyExampleText:
      "In advanced mode, the hours entered are multiplied by this value. An 8-hour job looks like this:",
    alertHourlyInvalid: "Enter an hourly value greater than zero.",
    alertHourlySaved: "Hourly value updated.",
    piecesPageIntro: "shown when you save an account.",
    newPiece: "+ New type",
    newPieceTitle: "New part type",
    editPiece: "Edit part type",
    piecePlaceholder: "e.g. Radiator",
    pieceRenameHint:
      "Accounts already saved keep the old name; only new records use the new one.",
    searchPiece: "Search part type...",
    sortBy: "Sort by",
    sortName: "Name (A–Z)",
    sortUsage: "Most used",
    sortRecent: "Most recent",
    colPiece: "Part type",
    colAccounts: "Accounts",
    emptyPiecesTitle: "No part types yet",
    emptyPiecesHint: "Add the types you handle most, like Radiator and Intercooler.",
    alertPieceRequired: "Enter the part type name.",
    alertPieceDuplicate: "A part type with this name already exists.",
    alertPieceSaved: "Part type added.",
    alertPieceUpdated: "Part type updated.",
    alertRemovePiece: "Remove this part type?",
    clientsPageIntro: "people and companies you link to accounts.",
    newClient: "+ New client",
    editClient: "Edit client",
    searchClient: "Name, nickname, tax ID, phone...",
    filterAll: "All",
    emptyClientsTitle: "No clients yet",
    emptyClientsHint: "Add an individual or a company to link to your accounts.",
    alertClientSaved: "Client added.",
    alertClientUpdated: "Client updated.",
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

// Compara sem acento e sem caixa: "radiador" casa com "Radiador".
function chaveDeBusca(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function toNumber(value: string): number {
  const limpo = value.replace(/[^\d.,-]/g, "");
  if (!limpo) return 0;

  const negativo = limpo.startsWith("-");
  let corpo = limpo.replace(/-/g, "");

  const ultimaVirgula = corpo.lastIndexOf(",");
  if (ultimaVirgula >= 0) {
    corpo =
      corpo.slice(0, ultimaVirgula).replace(/[.,]/g, "") +
      "." +
      corpo.slice(ultimaVirgula + 1).replace(/[.,]/g, "");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(corpo)) {
    // Sem virgula, ponto so e milhar quando agrupado de 3 em 3 ("1.500"). "1.5" continua 1,5.
    corpo = corpo.replace(/\./g, "");
  }

  const parsed = Number(corpo);
  if (!Number.isFinite(parsed)) return 0;
  return negativo ? -parsed : parsed;
}

// Moeda sempre BRL; o locale so muda a formatacao do numero.
function formatCurrency(value: number, locale: Locale = "pt-BR"): string {
  return value.toLocaleString(locale, {
    style: "currency",
    currency: "BRL",
  });
}

function formatDate(value: string, locale: Locale = "pt-BR"): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--/--/----";
  return date.toLocaleString(locale);
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
    return {
      labelKey: "passWeak" as const,
      width: `${strength}%`,
      color: "var(--danger)",
    };
  }
  if (strength < 100) {
    return {
      labelKey: "passMedium" as const,
      width: `${strength}%`,
      color: "var(--primary)",
    };
  }
  return {
    labelKey: "passStrong" as const,
    width: "100%",
    color: "var(--success)",
  };
}

function mapAccountRow(row: Record<string, unknown>): LilyAccount {
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
    ...mapAccountRow(row),
    docId,
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
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="input-group">
      <input
        id={props.id}
        type={props.type ?? "text"}
        placeholder=" "
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
      <label htmlFor={props.id}>{props.label}</label>
    </div>
  );
}

function SelectField(props: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="field-label" htmlFor={props.id}>
        {props.label}
      </label>
      <select
        id={props.id}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      >
        {props.children}
      </select>
    </div>
  );
}

function LabeledInput(props: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label className="field-label" htmlFor={props.id}>
        {props.label}
      </label>
      <input
        id={props.id}
        type={props.type ?? "text"}
        value={props.value}
        placeholder={props.placeholder}
        autoComplete={props.autoComplete}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </div>
  );
}

function RailButton(props: {
  label: string;
  active?: boolean;
  expanded?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={props.active ? "rail-btn is-active" : "rail-btn"}
      onClick={props.onClick}
      aria-label={props.label}
      aria-current={props.active ? "page" : undefined}
      aria-expanded={props.expanded}
    >
      {props.children}
      <span className="rail-tip" aria-hidden="true">
        {props.label}
      </span>
    </button>
  );
}

function SettingsCrumb(props: { label: string; onBack: () => void }) {
  return (
    <button type="button" className="settings-crumb" onClick={props.onBack}>
      <span aria-hidden="true">←</span> {props.label}
    </button>
  );
}

function setorAnular(
  raioInterno: number,
  raioExterno: number,
  grauInicio: number,
  grauFim: number,
): string {
  const ponto = (raio: number, grau: number) => {
    const rad = ((grau - 90) * Math.PI) / 180;
    return [200 + raio * Math.cos(rad), 200 + raio * Math.sin(rad)];
  };
  const [x1, y1] = ponto(raioExterno, grauInicio);
  const [x2, y2] = ponto(raioExterno, grauFim);
  const [x3, y3] = ponto(raioInterno, grauFim);
  const [x4, y4] = ponto(raioInterno, grauInicio);
  const arcoGrande = grauFim - grauInicio > 180 ? 1 : 0;
  return [
    `M ${x1} ${y1}`,
    `A ${raioExterno} ${raioExterno} 0 ${arcoGrande} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${raioInterno} ${raioInterno} 0 ${arcoGrande} 0 ${x4} ${y4}`,
    "Z",
  ].join(" ");
}

function marcasDoSetor(quantidade: number, grauInicio: number, grauFim: number) {
  const vao = (grauFim - grauInicio) / (quantidade + 1);
  return Array.from({ length: quantidade }, (_, indice) => {
    const grau = grauInicio + vao * (indice + 1);
    const rad = ((grau - 90) * Math.PI) / 180;
    return {
      x1: 200 + 152 * Math.cos(rad),
      y1: 200 + 152 * Math.sin(rad),
      x2: 200 + 168 * Math.cos(rad),
      y2: 200 + 168 * Math.sin(rad),
    };
  });
}

function ResultRow(props: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={props.strong ? "linha linha-strong" : "linha"}>
      <span>{props.label}</span>
      <span>{props.value}</span>
    </div>
  );
}

function Dialog(props: {
  title: string;
  kicker?: string;
  closeLabel: string;
  onClose: () => void;
  size?: "narrow" | "wide" | "radial";
  footer?: ReactNode;
  children: ReactNode;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(props.onClose);
  const titleId = useId();
  closeRef.current = props.onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const card = cardRef.current;

    function visibleFocusables(): HTMLElement[] {
      if (!card) return [];
      return Array.from(
        card.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);
    }

    const firstField = card?.querySelector<HTMLElement>(
      'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])',
    );
    (firstField ?? visibleFocusables()[0] ?? card)?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const items = visibleFocusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, []);

  const sizeClass =
    props.size === "wide"
      ? "modal-card is-wide"
      : props.size === "narrow"
        ? "modal-card is-narrow"
        : props.size === "radial"
          ? "modal-card is-radial"
          : "modal-card";

  return (
    <div
      className="modal-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <div
        className={sizeClass}
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="modal-head">
          <div>
            {props.kicker && <span className="section-kicker">{props.kicker}</span>}
            <h2 id={titleId}>{props.title}</h2>
          </div>
          <button
            type="button"
            className="close-modal"
            onClick={props.onClose}
            aria-label={props.closeLabel}
          >
            ×
          </button>
        </div>
        <div className="modal-body">{props.children}</div>
        {props.footer && <div className="modal-buttons">{props.footer}</div>}
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
    <span className={className} aria-hidden="true">
      {props.photoURL ? <img src={props.photoURL} alt="" /> : props.initial}
    </span>
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
  const [view, setViewState] = useState<View>(
    () => viewDaUrl(window.location.pathname) ?? "home",
  );

  function setView(next: View) {
    if (window.location.pathname !== ROTAS[next]) {
      window.history.pushState(null, "", ROTAS[next]);
    }
    setViewState(next);
  }

  useEffect(() => {
    if (viewDaUrl(window.location.pathname) === null) {
      window.history.replaceState(null, "", ROTAS.home);
    }
    const onPopState = () => {
      setViewState(viewDaUrl(window.location.pathname) ?? "home");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  const [isBlueMode, setIsBlueMode] = useState(false);
  const [rodaAberta, setRodaAberta] = useState(false);
  const [modoEmFoco, setModoEmFoco] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [accountsLoading, setAccountsLoading] = useState(false);
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
    () =>
      createWelcomeMessages(
        translations[readStorage<Locale>("lily_locale", "pt-BR")]
          .lilyChatWelcome,
      ),
  );
  const chatLogRef = useRef<HTMLDivElement>(null);
  const setoresRef = useRef<Array<HTMLButtonElement | null>>([]);
  const gavetaRef = useRef<HTMLElement>(null);
  const ofertaRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [lilyChatInput, setLilyChatInput] = useState("");
  const [lilyChatBusy, setLilyChatBusy] = useState(false);
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const browserRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const browserVoiceActiveRef = useRef(false);
  const browserRecognitionListeningRef = useRef(false);
  const browserIsSpeakingRef = useRef(false);
  const browserChatBusyRef = useRef(false);
  const engineOfflineAvisadaRef = useRef(false);
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
  const [hourlyDraft, setHourlyDraft] = useState("");
  const [pieceModal, setPieceModal] = useState<null | "new" | number>(null);
  const [newPiece, setNewPiece] = useState("");
  const [piecesSearch, setPiecesSearch] = useState("");
  const [piecesSort, setPiecesSort] = useState<"name" | "usage">("name");
  const [clientModal, setClientModal] = useState<null | "new" | number>(null);
  const [clientsSearch, setClientsSearch] = useState("");
  const [clientsTypeFilter, setClientsTypeFilter] = useState<"" | ClientType>("");
  const [clientsSort, setClientsSort] = useState<"name" | "recent" | "usage">(
    "name",
  );
  const [clientType, setClientType] = useState<ClientType>("PF");
  const [clientForm, setClientForm] = useState(emptyClientForm);
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
  const greetingKey = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return "coreGreetMorning" as const;
    if (hour < 18) return "coreGreetAfternoon" as const;
    return "coreGreetEvening" as const;
  })();
  const firstName = (displayName.includes("@")
    ? displayName.split("@")[0]
    : displayName
  )
    .trim()
    .split(/\s+/)[0];
  const greetingLine = `${t(greetingKey)}, ${firstName}`;
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

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    const log = chatLogRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [lilyChatMessages, lilyChatBusy, lilyAssistantMode, lilyAssistantOpen]);

  useEffect(() => {
    const gaveta = gavetaRef.current;
    if (!gaveta) return;

    const raiz = document.documentElement;
    const medir = () => {
      raiz.style.setProperty(
        "--gaveta-h",
        `${Math.round(gaveta.getBoundingClientRect().height)}px`,
      );
    };

    medir();
    if (typeof ResizeObserver === "undefined") return;
    const observador = new ResizeObserver(medir);
    observador.observe(gaveta);
    return () => {
      observador.disconnect();
      raiz.style.removeProperty("--gaveta-h");
    };
  }, [view, drawerOpen]);

  useEffect(() => {
    const oferta = ofertaRef.current;
    if (!oferta) return;

    const id = window.setTimeout(() => {
      const alvo = oferta.getBoundingClientRect();
      const teto = gavetaRef.current
        ? gavetaRef.current.getBoundingClientRect().top
        : window.innerHeight;
      const sobra = alvo.bottom - teto + 16;
      if (sobra > 0) {
        window.scrollBy({ top: sobra, behavior: "smooth" });
      } else if (alvo.top < 0) {
        window.scrollBy({ top: alvo.top - 16, behavior: "smooth" });
      }
    }, 260);

    return () => window.clearTimeout(id);
  }, [lilyChatMessages]);

  useEffect(() => {
    if (!userMenuOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (!userMenuRef.current?.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setUserMenuOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [userMenuOpen]);

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
    handleSelectAccount(account);
    localStorage.removeItem("editar_conta_id");
  }, [accounts]);

  async function loadAccounts(targetUser?: User | null) {
    const currentUser = targetUser ?? user;

    if (!isFirebaseConfigured || !db) {
      setAccounts(readStorage<LilyAccount[]>("contas", []));
      return;
    }

    if (!currentUser) return;

    setAccountsLoading(true);
    try {
      const accountsQuery = query(
        collection(db, "accounts"),
        where("user_id", "==", currentUser.uid),
        orderBy("data", "desc"),
      );
      const snapshot = await getDocs(accountsQuery);
      setAccounts(
        snapshot.docs.map((accountDoc) =>
          mapFirebaseAccount(
            accountDoc.id,
            accountDoc.data() as Record<string, unknown>,
          ),
        ),
      );
    } catch (error) {
      const detalhe = error instanceof Error ? error.message : String(error);
      notify(`${t("accountsLoadError")}: ${detalhe}`, "error");
    } finally {
      setAccountsLoading(false);
    }
  }

  function handleCalculate() {
    setResults(calculateResults(mainInputs, isBlueMode, config.valorHora || 40));
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

  function irPara(destino?: LilyDestino) {
    if (!destino) return;

    setAccountModalOpen(false);
    setPieceModal(null);
    setClientModal(null);

    if (destino === "inicio") {
      setView("home");
      setDrawerOpen(false);
      return;
    }
    if (destino === "calculadora") {
      setView("home");
      setDrawerOpen(true);
      return;
    }
    if (destino === "contas") {
      setView("accounts");
      return;
    }
    if (destino === "ajustes") {
      setView("settings");
      return;
    }

    openSettingsPage(
      destino === "valorHora" ? "hourly" : destino === "pecas" ? "pieces" : "clients",
    );
  }

  function preencherFormularioDaConta(campos: Partial<LilyCamposDaConta>) {
    if (!campos || typeof campos !== "object") return;

    setAccountModalOpen(true);

    const mudancas: Partial<AccountForm> = {};

    if (typeof campos.marca === "string" && campos.marca.trim()) {
      mudancas.marca = campos.marca.trim();
    }
    if (typeof campos.veiculo === "string" && campos.veiculo.trim()) {
      mudancas.veiculo = campos.veiculo.trim();
    }

    if (typeof campos.peca === "string" && campos.peca.trim()) {
      const alvo = chaveDeBusca(campos.peca);
      const encontrada = config.pecas.find(
        (peca) => chaveDeBusca(peca) === alvo,
      );
      if (encontrada) mudancas.tipoPeca = encontrada;
      else notify(t("lilyPecaNaoEncontrada"), "info");
    }

    if (campos.proprietario === "estoque") {
      mudancas.tipoProprietario = "estoque";
      mudancas.clienteSelect = "";
      mudancas.clienteTelefone = "";
    } else if (campos.proprietario === "cliente") {
      mudancas.tipoProprietario = "cliente";
    }

    if (typeof campos.cliente === "string" && campos.cliente.trim()) {
      const alvo = chaveDeBusca(campos.cliente);
      const encontrado = config.clientes.find((cliente) =>
        [cliente.nome, cliente.apelido, cliente.fantasia].some(
          (nome) => nome && chaveDeBusca(nome) === alvo,
        ),
      );
      if (encontrado) {
        mudancas.tipoProprietario = "cliente";
        mudancas.clienteSelect = String(encontrado.id);
      } else {
        notify(t("lilyClienteNaoEncontrado"), "info");
      }
    }

    if (typeof campos.vendidoPor === "number" && Number.isFinite(campos.vendidoPor)) {
      mudancas.vendidoPorInput = String(campos.vendidoPor);
    }
    if (typeof campos.maoDeObra === "number" && Number.isFinite(campos.maoDeObra)) {
      mudancas.maoDeObraInput = String(campos.maoDeObra);
    }

    if (!Object.keys(mudancas).length) return;
    setAccountForm((prev) => ({ ...prev, ...mudancas }));
  }

  function executarAcaoDaLily(acao: LilyAcao): Results | null {
    if (acao.tipo === "modo") {
      if (!acao.modo) return null;
      toggleMode(acao.modo === "avancado");
      return null;
    }

    if (acao.tipo === "salvar") {
      setAccountModalOpen(true);
      return null;
    }

    if (acao.tipo === "navegar") {
      irPara(acao.destino);
      return null;
    }

    if (acao.tipo === "conta") {
      preencherFormularioDaConta(acao.campos as Partial<LilyCamposDaConta>);
      return null;
    }

    if (!acao.campos) return null;

    const avancado = acao.modo ? acao.modo === "avancado" : isBlueMode;
    const novos: MainInputs = { ...mainInputs };
    let mexeu = false;
    for (const [chave, valor] of Object.entries(acao.campos)) {
      if (!(chave in defaultMainInputs)) continue;
      if (typeof valor !== "number" || !Number.isFinite(valor)) continue;
      novos[chave as keyof MainInputs] = String(valor);
      mexeu = true;
    }
    if (!mexeu) return null;

    if (acao.modo) setIsBlueMode(avancado);
    setSelectedAccountId(null);
    setMainInputs(novos);
    setDrawerOpen(true);
    const calculado = calculateResults(novos, avancado, config.valorHora || 40);
    setResults(calculado);
    return calculado;
  }

  function dispensarOferta(idDaMensagem: number) {
    setLilyChatMessages((prev) =>
      prev.map((mensagem) =>
        mensagem.id === idDaMensagem
          ? { ...mensagem, oferta: undefined }
          : mensagem,
      ),
    );
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
      const resposta = isTauriRuntime
        ? await askLilyDesktop(message, shouldSpeak)
        : await askLilyWeb(message, shouldSpeak);
      if (!resposta && !engineOfflineAvisadaRef.current) {
        engineOfflineAvisadaRef.current = true;
        notify(t("engineOffline"), "info");
      }

      const reply = resposta?.reply || createLocalLilyReply(message);

      const acao = resposta?.acao ?? null;
      const calculado = acao ? executarAcaoDaLily(acao) : null;

      setLilyChatMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          author: "lily",
          text: reply || createLocalLilyReply(message),
          oferta: calculado ? "salvar" : undefined,
        },
      ]);
      if (shouldSpeak && !isTauriRuntime) {
        if (resposta?.audio) {
          playLilyWebAudio(resposta.audio);
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

  function montarContextoDaLily() {
    const campos: Record<string, string> = {};
    const emDinheiro: Array<[keyof MainInputs, string]> = [
      ["vInicial", "valor inicial"],
      ["frete", "frete"],
      ["func", "funcionario"],
      ["material", "material"],
      ["inss", "INSS"],
    ];
    for (const [chave, rotulo] of emDinheiro) {
      const valor = toNumber(mainInputs[chave]);
      if (valor) campos[rotulo] = formatCurrency(valor, locale);
    }
    const horas = toNumber(mainInputs.horas);
    if (horas) campos["horas de servico"] = String(horas);

    const resultado: Record<string, string> = {};
    if (results) {
      resultado["se vender por"] = formatCurrency(results.venda, locale);
      resultado["custo"] = formatCurrency(results.custo, locale);
      resultado["lucro final"] = formatCurrency(results.lucro, locale);
      if (results.montagem !== undefined) {
        resultado["montagem"] = formatCurrency(results.montagem, locale);
      }
      if (results.cm !== undefined) {
        resultado["custo da montagem"] = formatCurrency(results.cm, locale);
      }
      if (results.mv !== undefined) {
        resultado["montagem + venda"] = formatCurrency(results.mv, locale);
      }
    }

    const janela = accountModalOpen
      ? "salvarConta"
      : pieceModal !== null
        ? "peca"
        : clientModal !== null
          ? "cliente"
          : profileModalOpen
            ? "perfil"
            : termsOpen
              ? "termos"
              : null;

    return {
      tela: TELA_DA_VIEW[view],
      gaveta: drawerOpen,
      janela,
      formularioDaConta: accountModalOpen
        ? montarFormularioDaContaParaLily()
        : null,
      pecasCadastradas: config.pecas,
      clientesCadastrados: config.clientes.length,
      modo: isBlueMode ? "avancado" : "padrao",
      valorHora: formatCurrency(config.valorHora || 40, locale),
      campos,
      resultado,
      contaSelecionada: selectedAccount
        ? {
            veiculo: selectedAccount.veiculo,
            marca: selectedAccount.marca,
            peca: selectedAccount.tipoPeca,
          }
        : null,
      contasNoModo: accounts.filter((conta) => conta.modo === isBlueMode)
        .length,
    };
  }

  function montarFormularioDaContaParaLily() {
    const preenchidos: Record<string, string> = {};
    const vazios: string[] = [];

    const texto: Array<[string, string]> = [
      ["marca", accountForm.marca],
      ["veiculo", accountForm.veiculo],
      ["tipo de peca", accountForm.tipoPeca],
    ];
    for (const [rotulo, valor] of texto) {
      if (valor.trim()) preenchidos[rotulo] = valor.trim();
      else vazios.push(rotulo);
    }

    const dinheiro: Array<[string, string]> = [
      ["vendido por", accountForm.vendidoPorInput],
      ["mao de obra", accountForm.maoDeObraInput],
    ];
    for (const [rotulo, valor] of dinheiro) {
      const numero = toNumber(valor);
      if (numero) preenchidos[rotulo] = formatCurrency(numero, locale);
      else vazios.push(rotulo);
    }

    if (accountForm.tipoProprietario === "cliente") {
      preenchidos["dono"] = "de um cliente";
      if (accountForm.clienteSelect) preenchidos["cliente"] = "ja escolhido";
      else vazios.push("qual cliente");
    } else {
      preenchidos["dono"] = "estoque";
    }

    return { preenchidos, vazios };
  }

  function montarHistoricoDaLily() {
    return lilyChatMessages
      .slice(-LILY_HISTORICO_MAX)
      .map((mensagem) => ({
        autor: mensagem.author,
        texto: mensagem.text,
      }));
  }

  async function askLilyDesktop(message: string, speak: boolean) {
    try {
      const resposta = await invoke<LilyWebResponse>("ask_lily_chat", {
        message,
        speak,
        contexto: montarContextoDaLily(),
        historico: montarHistoricoDaLily(),
      });
      if (!resposta || resposta.error) return null;
      return resposta;
    } catch {
      return null;
    }
  }

  async function askLilyWeb(message: string, speak: boolean) {
    try {
      const response = await fetch(`${lilyWebServerUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          speak,
          contexto: montarContextoDaLily(),
          historico: montarHistoricoDaLily(),
        }),
        // Sem timeout, uma porta filtrada deixa o fetch pendurado e o chat trava.
        signal: AbortSignal.timeout(8000),
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
        signal: AbortSignal.timeout(8000),
      });
      if (response.ok) {
        const data = (await response.json()) as LilyWebResponse;
        if (data.audio) {
          playLilyWebAudio(data.audio);
          return;
        }
      }
    } catch {
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
      if (name.includes("francisca") || name.includes("franciscaneural")) score += 20;
      if (/maria|helena|luciana/.test(name)) score += 8;
      if (/female|natural|online/.test(name)) score += 4;
      if (/google|cloud/.test(name)) score += 3;
      if (/male|daniel|paulo/.test(name)) score -= 4;
      if (voice.localService) score += 2;

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
    if (
      normalized.includes("calcular") ||
      normalized.includes("calculate") ||
      normalized.includes("conta") ||
      normalized.includes("account")
    ) {
      return t("lilyReplyCalc");
    }
    if (
      normalized.includes("voz") ||
      normalized.includes("voice") ||
      normalized.includes("microfone") ||
      normalized.includes("microphone")
    ) {
      return isTauriRuntime
        ? t("lilyReplyVoiceDesktop")
        : t("lilyReplyVoiceWeb");
    }
    if (normalized.includes("cliente") || normalized.includes("client")) {
      return t("lilyReplyClients");
    }
    return t("lilyReplyDefault");
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
    return chaveDeBusca(value);
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

  function limparServico() {
    setSelectedAccountId(null);
    setMainInputs(defaultMainInputs);
    setResults(null);
    setAccountForm(defaultAccountForm);
    clearAccountImage();
  }

  function handleNewAccount() {
    limparServico();
    setView("home");
    setDrawerOpen(true);
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
      clienteSelect: matchedClient ? String(matchedClient.id) : "",
      clienteTelefone: matchedClient?.tel || account.clienteNome,
      vendidoPorInput: account.vendidoPor,
      maoDeObraInput: account.maoDeObra,
    });
    clearAccountImage();
    setResults(calculateResults(nextInputs, account.modo, config.valorHora || 40));
  }

  async function performRegister() {
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

  async function performLogin() {
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

    let credential;
    try {
      credential = await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      await credential.user.reload();
    } catch {
      notify(t("alertLoginError"), "error");
      return;
    }

    try {
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
      setUser(credential.user);
      setAuthVisible(false);
      setLoginEmail("");
      setLoginPassword("");

      const userRef = doc(db, "users", credential.user.uid);
      const userSnapshot = await getDoc(userRef);
      const userDoc = userSnapshot.exists() ? userSnapshot.data() : {};

      setUserData({
        nome: String(userDoc.nome ?? credential.user.displayName ?? credential.user.email ?? t("userMenuAccount")),
        user: String(userDoc.user ?? credential.user.email?.split("@")[0] ?? "usuario"),
        email: String(credential.user.email ?? ""),
        phone: String(userDoc.phone ?? ""),
        doc: String(userDoc.doc ?? ""),
        type: (String(userDoc.type ?? "PF") === "PJ" ? "PJ" : "PF") as AccountType,
        photoURL: String(userDoc.photoURL ?? credential.user.photoURL ?? ""),
      });
      await loadAccounts(credential.user);
    } catch (error) {
      const detalhe = error instanceof Error ? error.message : String(error);
      notify(`${t("loginDataError")}: ${detalhe}`, "error");
    }
  }

  async function handleRegister() {
    if (authBusy) return;
    setAuthBusy(true);
    try {
      await performRegister();
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleLogin() {
    if (authBusy) return;
    setAuthBusy(true);
    try {
      await performLogin();
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleForgotPassword() {
    if (authBusy) return;
    if (!isFirebaseConfigured || !auth) {
      notify(t("forgotPasswordOffline"), "error");
      return;
    }
    const email = loginEmail.trim();
    if (!email) {
      notify(t("forgotPasswordNeedEmail"), "info");
      return;
    }
    setAuthBusy(true);
    try {
      auth.languageCode = locale;
      await sendPasswordResetEmail(auth, email);
      notify(t("forgotPasswordSent"), "success");
    } catch (error) {
      const code = (error as { code?: string }).code;
      // Conta inexistente recebe a mesma resposta de sucesso: a tela
      // nao pode servir para descobrir quais e-mails tem cadastro.
      if (code === "auth/user-not-found") {
        notify(t("forgotPasswordSent"), "success");
      } else if (code === "auth/invalid-email") {
        notify(t("forgotPasswordInvalidEmail"), "error");
      } else {
        notify(t("forgotPasswordError"), "error");
      }
    } finally {
      setAuthBusy(false);
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

    let credencialFalhou = false;

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
              nextUserData.email = userData?.email ?? user.email ?? nextUserData.email;
              notify(t("profileEmailAuthWarning"), "error");
              credencialFalhou = true;
            }
          }

          if (passwordChanged) {
            try {
              await updatePassword(auth.currentUser, profileForm.newPassword);
              notify(t("profilePasswordUpdated"), "success");
            } catch {
              notify(t("profilePasswordRecentLogin"), "error");
              credencialFalhou = true;
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

      setUserData(nextUserData);
      setProfilePhotoFile(null);
      if (!credencialFalhou) {
        setProfileModalOpen(false);
        notify(t("profileSaved"), "success");
      }
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

  function handleSelectAccount(account: LilyAccount) {
    applyAccountToForm(account);
    setView("home");
    setDrawerOpen(true);
  }

  async function handleDeleteAccount(id: number) {
    if (!window.confirm(t("alertDeleteConfirm"))) return;

    const current = accounts.find((item) => item.id === id);
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

    if (isFirebaseConfigured && db) {
      try {
        if (existingAccount?.docId) {
          await updateDoc(doc(db, "accounts", existingAccount.docId), payload);
          mapped = {
            ...mapAccountRow(payload as unknown as Record<string, unknown>),
            docId: existingAccount.docId,
          };
        } else {
          const created = await addDoc(collection(db, "accounts"), {
            ...payload,
            createdAt: serverTimestamp(),
          });
          mapped = {
            ...mapAccountRow(payload as unknown as Record<string, unknown>),
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
      mapped = mapAccountRow(payload as unknown as Record<string, unknown>);
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

  function openSettingsPage(page: SettingsPage) {
    setView(page);
  }

  useEffect(() => {
    if (view === "hourly") setHourlyDraft(String(config.valorHora));
  }, [view]);

  const hourlyDraftValue = toNumber(hourlyDraft);
  const hourlyDirty = hourlyDraftValue !== config.valorHora;

  function saveHourly() {
    if (hourlyDraftValue <= 0) {
      notify(t("alertHourlyInvalid"), "error");
      return;
    }
    setConfig((prev) => ({ ...prev, valorHora: hourlyDraftValue }));
    setHourlyDraft(String(hourlyDraftValue));
    notify(t("alertHourlySaved"), "success");
  }

  function openPieceModal(index: number | "new") {
    setNewPiece(index === "new" ? "" : (config.pecas[index] ?? ""));
    setPieceModal(index);
  }

  function savePiece() {
    const piece = newPiece.trim();
    if (!piece) {
      notify(t("alertPieceRequired"), "error");
      return;
    }
    const duplicada = config.pecas.some(
      (item, index) =>
        index !== pieceModal && chaveDeBusca(item) === chaveDeBusca(piece),
    );
    if (duplicada) {
      notify(t("alertPieceDuplicate"), "error");
      return;
    }
    setConfig((prev) => ({
      ...prev,
      pecas:
        pieceModal === "new"
          ? [...prev.pecas, piece]
          : prev.pecas.map((item, index) => (index === pieceModal ? piece : item)),
    }));
    notify(pieceModal === "new" ? t("alertPieceSaved") : t("alertPieceUpdated"), "success");
    setPieceModal(null);
    setNewPiece("");
  }

  function removePiece(index: number) {
    if (!window.confirm(t("alertRemovePiece"))) return;
    setConfig((prev) => ({
      ...prev,
      pecas: prev.pecas.filter((_item, currentIndex) => currentIndex !== index),
    }));
  }

  function openClientModal(client: Client | "new") {
    if (client === "new") {
      setClientType("PF");
      setClientForm(emptyClientForm);
      setClientModal("new");
      return;
    }
    const pf = client.tipo === "PF";
    setClientType(client.tipo);
    setClientForm({
      nome: pf ? client.nome : "",
      apelido: client.apelido ?? "",
      cpf: pf ? client.doc : "",
      razaoSocial: pf ? "" : client.nome,
      nomeFantasia: client.fantasia ?? "",
      cnpj: pf ? "" : client.doc,
      inscEstadual: client.ie ?? "",
      tel: client.tel,
      email: client.email,
      endereco: client.endereco,
    });
    setClientModal(client.id);
  }

  function saveClient() {
    const nome = clientType === "PF" ? clientForm.nome : clientForm.razaoSocial;
    const doc = clientType === "PF" ? clientForm.cpf : clientForm.cnpj;
    if (!nome.trim() || !doc.trim()) {
      notify(t("alertClientRequired"), "error");
      return;
    }

    const client: Client = {
      id: clientModal === "new" || clientModal === null ? Date.now() : clientModal,
      tipo: clientType,
      nome: nome.trim(),
      apelido: clientType === "PF" ? clientForm.apelido : "",
      fantasia: clientType === "PJ" ? clientForm.nomeFantasia : "",
      doc,
      tel: clientForm.tel,
      email: clientForm.email,
      endereco: clientForm.endereco,
      ie: clientType === "PJ" ? clientForm.inscEstadual : "",
    };

    setConfig((prev) => ({
      ...prev,
      clientes:
        clientModal === "new"
          ? [...prev.clientes, client]
          : prev.clientes.map((item) => (item.id === client.id ? client : item)),
    }));
    notify(
      clientModal === "new" ? t("alertClientSaved") : t("alertClientUpdated"),
      "success",
    );
    setClientModal(null);
    setClientForm(emptyClientForm);
  }

  function removeClient(id: number) {
    if (!window.confirm(t("alertRemoveClient"))) return;
    setConfig((prev) => ({
      ...prev,
      clientes: prev.clientes.filter((client) => client.id !== id),
    }));
  }

  // As contas guardam o NOME da peca/cliente, entao a contagem e por nome.
  const usoPorPeca = new Map<string, number>();
  const usoPorCliente = new Map<string, number>();
  for (const account of accounts) {
    const peca = chaveDeBusca(account.tipoPeca || "");
    const cliente = chaveDeBusca(account.clienteNome || "");
    if (peca) usoPorPeca.set(peca, (usoPorPeca.get(peca) ?? 0) + 1);
    if (cliente) usoPorCliente.set(cliente, (usoPorCliente.get(cliente) ?? 0) + 1);
  }
  const usoDaPeca = (piece: string) => usoPorPeca.get(chaveDeBusca(piece)) ?? 0;
  const usoDoCliente = (client: Client) =>
    usoPorCliente.get(chaveDeBusca(client.nome)) ?? 0;

  const piecesQuery = chaveDeBusca(piecesSearch);
  const visiblePieces = config.pecas
    .map((piece, index) => ({ piece, index, uso: usoDaPeca(piece) }))
    .filter(({ piece }) => chaveDeBusca(piece).includes(piecesQuery))
    .sort((a, b) =>
      piecesSort === "usage"
        ? b.uso - a.uso || a.piece.localeCompare(b.piece, locale)
        : a.piece.localeCompare(b.piece, locale),
    );

  const clientsQuery = chaveDeBusca(clientsSearch);
  const clientsQueryDigits = clientsSearch.replace(/\D/g, "");
  const visibleClients = config.clientes
    .filter((client) => {
      if (clientsTypeFilter && client.tipo !== clientsTypeFilter) return false;
      if (!clientsQuery) return true;
      const texto = chaveDeBusca(
        [client.nome, client.apelido, client.fantasia, client.email].join(" "),
      );
      // CPF, CNPJ e telefone comparam so os digitos.
      const digitos = (client.doc + " " + client.tel).replace(/\D/g, "");
      return (
        texto.includes(clientsQuery) ||
        (clientsQueryDigits.length >= 3 && digitos.includes(clientsQueryDigits))
      );
    })
    .sort((a, b) =>
      clientsSort === "recent"
        ? b.id - a.id
        : clientsSort === "usage"
          ? usoDoCliente(b) - usoDoCliente(a) || a.nome.localeCompare(b.nome, locale)
          : a.nome.localeCompare(b.nome, locale),
    );
  const clientsFiltering = !!clientsQuery || !!clientsTypeFilter;

  const modeAccounts = accounts.filter((account) => account.modo === isBlueMode);

  const visibleAccounts = modeAccounts.filter((account) => {
    const matchesSearch =
      account.veiculo.toLowerCase().includes(accountsSearch.toLowerCase()) ||
      account.clienteNome.toLowerCase().includes(accountsSearch.toLowerCase());
    const matchesBrand =
      !accountsBrandFilter || account.marca === accountsBrandFilter;
    return matchesSearch && matchesBrand;
  });

  const selectedAccount = accounts.find((account) => account.id === selectedAccountId);
  const accountModalTitle = selectedAccount ? t("editAccount") : t("saveAccount");
  const accountSaveLabel = selectedAccount ? t("update") : t("confirm");
  const assistantConsoleOpen = lilyAssistantOpen && lilyAssistantMode !== null;
  const isFiltering = Boolean(accountsSearch || accountsBrandFilter);

  const drawerSummary = selectedAccount
    ? [
        selectedAccount.veiculo || t("noVehicle"),
        selectedAccount.tipoPeca || t("piece"),
        results ? `${t("finalProfitShort")} ${formatCurrency(results.lucro, locale)}` : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : results
      ? `${t("finalProfitShort")} ${formatCurrency(results.lucro, locale)}`
      : t("drawerIdle");

  const trabalhoEmAndamento = Boolean(selectedAccount || results);
  const continueLabel = selectedAccount
    ? `${t("continueWork")}: ${selectedAccount.veiculo || t("noVehicle")}`
    : results
      ? `${t("continueWork")}: ${t("finalProfitShort")} ${formatCurrency(results.lucro, locale)}`
      : "";

  function toggleMode(nextBlue: boolean) {
    setIsBlueMode(nextBlue);
    setSelectedAccountId(null);
    setResults(null);
  }

  function abrirRodaDeModo() {
    setModoEmFoco(isBlueMode);
    setRodaAberta(true);
  }

  function escolherModo(avancado: boolean) {
    toggleMode(avancado);
    setRodaAberta(false);
  }

  const SETORES = [
    {
      avancado: false,
      inicio: 184,
      fim: 356,
      campos: 3,
      nome: t("yellow"),
      desc: t("modeStandardDesc"),
    },
    {
      avancado: true,
      inicio: 4,
      fim: 176,
      campos: 7,
      nome: t("blue"),
      desc: t("modeAdvancedDesc"),
    },
  ];

  const setorEmFoco = SETORES[modoEmFoco ? 1 : 0];

  const rodaDeModo = rodaAberta && (
    <Dialog
      title={t("modeDialTitle")}
      kicker={t("modeDialKicker")}
      closeLabel={t("cancel")}
      onClose={() => setRodaAberta(false)}
      size="radial"
    >
      <p className="mode-wheel-hint">{t("modeDialHint")}</p>

      <div
        className="mode-wheel"
        role="radiogroup"
        aria-label={t("modeDialTitle")}
        onKeyDown={(event) => {
          const paraAvancado =
            event.key === "ArrowRight" || event.key === "ArrowDown"
              ? true
              : event.key === "ArrowLeft" || event.key === "ArrowUp"
                ? false
                : null;
          if (paraAvancado === null) return;
          event.preventDefault();
          setModoEmFoco(paraAvancado);
          setoresRef.current[paraAvancado ? 1 : 0]?.focus();
        }}
      >
        <svg viewBox="0 0 400 400" aria-hidden="true">
          {SETORES.map((setor) => (
            <g
              key={String(setor.avancado)}
              className={[
                "mode-sector",
                setor.avancado ? "is-advanced" : "is-standard",
                setor.avancado === modoEmFoco ? "is-focused" : "",
                setor.avancado === isBlueMode ? "is-current" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <path d={setorAnular(84, 142, setor.inicio, setor.fim)} />
              {marcasDoSetor(setor.campos, setor.inicio, setor.fim).map(
                (marca, indice) => (
                  <line
                    key={indice}
                    x1={marca.x1}
                    y1={marca.y1}
                    x2={marca.x2}
                    y2={marca.y2}
                  />
                ),
              )}
            </g>
          ))}
          <circle className="mode-wheel-core" cx="200" cy="200" r="76" />
        </svg>

        <div className="mode-wheel-center" aria-hidden="true">
          <strong>{setorEmFoco.nome}</strong>
          <span>
            {setorEmFoco.campos} {t("modeFields")}
          </span>
          <em
            className={
              setorEmFoco.avancado === isBlueMode ? undefined : "is-idle"
            }
          >
            {t("modeActiveNow")}
          </em>
        </div>

        {SETORES.map((setor, indice) => (
          <button
            key={String(setor.avancado)}
            type="button"
            role="radio"
            aria-checked={setor.avancado === modoEmFoco}
            aria-label={`${setor.nome} — ${setor.desc}`}
            tabIndex={setor.avancado === modoEmFoco ? 0 : -1}
            ref={(elemento) => {
              setoresRef.current[indice] = elemento;
            }}
            className={
              setor.avancado
                ? "mode-sector-hit is-advanced"
                : "mode-sector-hit is-standard"
            }
            onMouseEnter={() => setModoEmFoco(setor.avancado)}
            onFocus={() => setModoEmFoco(setor.avancado)}
            onClick={() => escolherModo(setor.avancado)}
          />
        ))}
      </div>

      <p className="mode-wheel-desc" aria-live="polite">
        {setorEmFoco.desc}
      </p>
    </Dialog>
  );

  const railModeButtons = (
    <button
      type="button"
      className={
        isBlueMode ? "rail-mode-trigger is-advanced" : "rail-mode-trigger"
      }
      aria-haspopup="dialog"
      aria-expanded={rodaAberta}
      aria-label={`${t("modeOpen")} — ${isBlueMode ? t("blue") : t("yellow")}`}
      onClick={abrirRodaDeModo}
    >
      <span className="rail-mode-dot" aria-hidden="true" />
      <span className="rail-tip" aria-hidden="true">
        {isBlueMode ? t("blue") : t("yellow")}
      </span>
    </button>
  );

  return (
    <div className={isBlueMode ? "app-shell azul" : "app-shell"}>
      {rodaDeModo}
      <div className="app-bg" aria-hidden="true" />
      <Toasts messages={toasts} />

      {authVisible ? (
        <div id="auth-screen">
          <div className="auth-shell">
            <section className="auth-hero">
              <span className="auth-badge">{t("authBadge")}</span>
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

            <section className="auth-panel">
              <div className="auth-panel-header">
                <span className="lily-kicker">
                  {authMode === "login" ? t("authLoginKicker") : t("authRegisterKicker")}
                </span>
                <h2>
                  {authMode === "login" ? t("authLoginTitle") : t("authRegisterTitle")}
                </h2>
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
                  <LabeledInput
                    id="login-email"
                    label={t("email")}
                    type="email"
                    autoComplete="email"
                    placeholder={t("loginEmailPlaceholder")}
                    value={loginEmail}
                    onChange={setLoginEmail}
                  />
                  <LabeledInput
                    id="login-password"
                    label={t("password")}
                    type="password"
                    autoComplete="current-password"
                    placeholder={t("passwordPlaceholder")}
                    value={loginPassword}
                    onChange={setLoginPassword}
                  />
                  <button
                    className="link-button auth-forgot"
                    type="button"
                    disabled={authBusy}
                    onClick={() => void handleForgotPassword()}
                  >
                    {t("forgotPassword")}
                  </button>
                  <button type="submit" disabled={authBusy}>
                    {authBusy ? t("loginBusy") : t("loginSubmit")}
                  </button>
                  <p className="auth-switch-copy">
                    {t("noAccount")}{" "}
                    <button
                      className="link-button"
                      type="button"
                      onClick={() => setAuthMode("register")}
                    >
                      {t("createRegistration")}
                    </button>
                  </p>
                </form>
              ) : (
                <form
                  className="auth-form"
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
                    <div className="span-two">
                      <LabeledInput
                        id="register-name"
                        label={t("profileName")}
                        autoComplete="name"
                        placeholder={t("registerNamePlaceholder")}
                        value={registerForm.nome}
                        onChange={(value) =>
                          setRegisterForm((prev) => ({ ...prev, nome: value }))
                        }
                      />
                    </div>
                    <LabeledInput
                      id="register-email"
                      label={t("email")}
                      type="email"
                      autoComplete="email"
                      placeholder={t("registerEmailPlaceholder")}
                      value={registerForm.email}
                      onChange={(value) =>
                        setRegisterForm((prev) => ({ ...prev, email: value }))
                      }
                    />
                    <LabeledInput
                      id="register-doc"
                      label={accountType === "PF" ? "CPF" : "CNPJ"}
                      placeholder={
                        accountType === "PF" ? "000.000.000-00" : "00.000.000/0000-00"
                      }
                      value={registerForm.doc}
                      onChange={(value) =>
                        setRegisterForm((prev) => ({
                          ...prev,
                          doc: formatDoc(value, accountType),
                        }))
                      }
                    />
                    <LabeledInput
                      id="register-phone"
                      label={t("phone")}
                      type="tel"
                      autoComplete="tel"
                      placeholder="(00) 00000-0000"
                      value={registerForm.phone}
                      onChange={(value) =>
                        setRegisterForm((prev) => ({
                          ...prev,
                          phone: formatPhone(value),
                        }))
                      }
                    />
                    <LabeledInput
                      id="register-user"
                      label={t("profileUser")}
                      autoComplete="username"
                      placeholder={t("registerUserPlaceholder")}
                      value={registerForm.user}
                      onChange={(value) =>
                        setRegisterForm((prev) => ({ ...prev, user: value }))
                      }
                    />
                    <div className="span-two">
                      <LabeledInput
                        id="register-password"
                        label={t("password")}
                        type="password"
                        autoComplete="new-password"
                        placeholder={t("registerPasswordPlaceholder")}
                        value={registerForm.pass}
                        onChange={(value) =>
                          setRegisterForm((prev) => ({ ...prev, pass: value }))
                        }
                      />
                      <div className="strength-track">
                        <span
                          className="strength-bar"
                          style={{
                            width: passwordStrength.width,
                            background: passwordStrength.color,
                          }}
                        />
                      </div>
                      <small className="strength-label">
                        {t(passwordStrength.labelKey)}
                      </small>
                    </div>
                    <div className="span-two">
                      <LabeledInput
                        id="register-password-confirm"
                        label={t("registerConfirmPassword")}
                        type="password"
                        autoComplete="new-password"
                        placeholder={t("registerConfirmPasswordPlaceholder")}
                        value={registerForm.confirmPass}
                        onChange={(value) =>
                          setRegisterForm((prev) => ({ ...prev, confirmPass: value }))
                        }
                      />
                    </div>
                  </div>

                  <label className="terms-row" htmlFor="register-terms">
                    <input
                      id="register-terms"
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
                      {t("termsAcceptPrefix")} {t("termsUse")} {t("termsAcceptSuffix")}
                    </span>
                  </label>
                  <button
                    className="link-button"
                    type="button"
                    style={{ justifySelf: "start" }}
                    onClick={() => setTermsOpen(true)}
                  >
                    {t("openTerms")}
                  </button>

                  <button type="submit" disabled={authBusy}>
                    {authBusy ? t("registerBusy") : t("finishRegistration")}
                  </button>
                  <p className="auth-switch-copy">
                    {t("alreadyAccount")}{" "}
                    <button
                      className="link-button"
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
      ) : (
        <>
          <nav className="app-rail" aria-label={t("navMain")}>
            <span className="rail-brand" aria-hidden="true">
              L
            </span>
            <span className="rail-sep" aria-hidden="true" />

            <RailButton
              label={t("navCore")}
              active={view === "home"}
              onClick={() => setView("home")}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="3.2" />
                <circle cx="12" cy="12" r="8.2" />
                <path d="M12 3.8v2M12 18.2v2M3.8 12h2M18.2 12h2" />
              </svg>
            </RailButton>

            <RailButton
              label={t("navCalc")}
              expanded={drawerOpen}
              onClick={() => {
                setView("home");
                setDrawerOpen((prev) => !prev);
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="4" y="3" width="16" height="18" rx="2.5" />
                <path d="M8 8h8M8 12h2M12 12h.01M16 12h.01M8 16h2M12 16h.01M16 16h.01" />
              </svg>
            </RailButton>

            <RailButton
              label={t("navAccounts")}
              active={view === "accounts"}
              onClick={() => setView("accounts")}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 6h16M4 12h16M4 18h10" />
                <circle cx="18.5" cy="18" r="2.2" />
              </svg>
            </RailButton>

            <RailButton
              label={t("navSettings")}
              active={SETTINGS_PAGES.includes(view)}
              onClick={() => setView("settings")}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="3.2" />
                <path d="M19.2 14.6a1.5 1.5 0 0 0 .3 1.65l.05.06a1.8 1.8 0 1 1-2.55 2.55l-.06-.06a1.5 1.5 0 0 0-2.55 1.07v.17a1.8 1.8 0 1 1-3.6 0v-.09a1.5 1.5 0 0 0-2.61-1.01l-.06.06a1.8 1.8 0 1 1-2.55-2.55l.06-.06A1.5 1.5 0 0 0 4.1 13.9h-.17a1.8 1.8 0 1 1 0-3.6h.09a1.5 1.5 0 0 0 1.01-2.61l-.06-.06a1.8 1.8 0 1 1 2.55-2.55l.06.06a1.5 1.5 0 0 0 1.65.3h.08a1.5 1.5 0 0 0 .9-1.37v-.17a1.8 1.8 0 1 1 3.6 0v.09a1.5 1.5 0 0 0 2.61 1.01l.06-.06a1.8 1.8 0 1 1 2.55 2.55l-.06.06a1.5 1.5 0 0 0-.3 1.65v.08a1.5 1.5 0 0 0 1.37.9h.17a1.8 1.8 0 1 1 0 3.6h-.09a1.5 1.5 0 0 0-1.37.9z" />
              </svg>
            </RailButton>

            <div className="rail-foot">
              {railModeButtons}
              <div ref={userMenuRef}>
                <button
                  type="button"
                  className="rail-avatar"
                  aria-haspopup="menu"
                  aria-expanded={userMenuOpen}
                  aria-label={t("openUserMenu")}
                  onClick={() => setUserMenuOpen((prev) => !prev)}
                >
                  <UserAvatar initial={userInitial} photoURL={displayPhoto} />
                </button>

                {userMenuOpen && (
                  <div className="user-pop" role="menu">
                    <div className="user-pop-head">
                      <UserAvatar initial={userInitial} photoURL={displayPhoto} />
                      <div>
                        <strong>{displayName}</strong>
                        <span>{displayEmail}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      role="menuitem"
                      className="user-pop-item"
                      onClick={() => {
                        setUserMenuOpen(false);
                        openProfileModal();
                      }}
                    >
                      {t("userMenuProfile")}
                    </button>

                    <div className="user-pop-group">
                      <span>{t("userMenuLanguage")}</span>
                      <div className="language-switcher">
                        <button
                          type="button"
                          className={locale === "pt-BR" ? "is-active" : ""}
                          aria-pressed={locale === "pt-BR"}
                          onClick={() => setLocale("pt-BR")}
                        >
                          PT
                        </button>
                        <button
                          type="button"
                          className={locale === "en-US" ? "is-active" : ""}
                          aria-pressed={locale === "en-US"}
                          onClick={() => setLocale("en-US")}
                        >
                          EN
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      role="menuitem"
                      className="user-pop-item user-pop-logout"
                      onClick={() => void handleLogout()}
                    >
                      {t("userMenuLogout")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </nav>

          <main className="app-view">
            {view === "home" && (
              <section
                className={
                  assistantConsoleOpen ? "core-stage has-console" : "core-stage"
                }
                aria-label={t("lilyAssistantTitle")}
              >
                <button
                  type="button"
                  className={lilyCoreStateClass}
                  aria-label={t("lilyCoreLabel")}
                  title={t("lilyCoreHint")}
                  aria-expanded={lilyAssistantOpen}
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

                <p className="core-greet">
                  {greetingLine}
                  <span className="core-greet-brand"> · {t("appSubtitle")}</span>
                </p>
                <h2 className="core-ask">{t("coreAsk")}</h2>

                <div className="core-chips">
                  <button
                    type="button"
                    className="core-chip is-hot"
                    onClick={handleNewAccount}
                  >
                    {t("startNewService")}
                  </button>
                  {trabalhoEmAndamento && (
                    <button
                      type="button"
                      className={drawerOpen ? "core-chip is-on" : "core-chip"}
                      aria-expanded={drawerOpen}
                      onClick={() => setDrawerOpen(true)}
                    >
                      {continueLabel}
                    </button>
                  )}
                </div>

                <div className="lily-mode-satellites" aria-label={t("lilyChooseMode")}>
                  <button
                    type="button"
                    className={
                      lilyAssistantOpen && lilyAssistantMode === "voice"
                        ? "lily-mini is-active"
                        : "lily-mini"
                    }
                    aria-pressed={lilyAssistantOpen && lilyAssistantMode === "voice"}
                    onClick={() => {
                      setLilyAssistantMode("voice");
                      setLilyAssistantOpen(true);
                    }}
                  >
                    <span className="lily-mini-orb" aria-hidden="true">
                      V
                    </span>
                    <strong>{t("lilyVoiceMode")}</strong>
                  </button>
                  <button
                    type="button"
                    className={
                      lilyAssistantOpen && lilyAssistantMode === "chat"
                        ? "lily-mini is-active"
                        : "lily-mini"
                    }
                    aria-pressed={lilyAssistantOpen && lilyAssistantMode === "chat"}
                    onClick={() => {
                      setLilyAssistantMode("chat");
                      setLilyAssistantOpen(true);
                    }}
                  >
                    <span className="lily-mini-orb" aria-hidden="true">
                      M
                    </span>
                    <strong>{t("lilyMessageMode")}</strong>
                  </button>
                </div>

                {lilyAssistantOpen && lilyAssistantMode === "voice" && (
                  <div className="lily-voice-console">
                    <div>
                      <span className="lily-kicker">{t("lilyVoiceMode")}</span>
                      <h3>{lilyVoiceLabel}</h3>
                      <p>
                        {isTauriRuntime
                          ? t("lilyVoiceHintActive")
                          : browserVoiceSupported
                            ? t("lilyVoiceWebHint")
                            : t("lilyVoiceDesktopOnly")}
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
                    <div className="lily-chat-log" aria-live="polite" ref={chatLogRef}>
                      {lilyChatMessages.map((message) => (
                        <div
                          key={message.id}
                          className={`lily-chat-message lily-chat-${message.author}`}
                        >
                          <span>
                            {message.author === "lily" ? "L.I.L.Y" : displayName}
                          </span>
                          <p>{message.text}</p>
                          {message.oferta === "salvar" && (
                            <div className="lily-chat-oferta" ref={ofertaRef}>
                              <span>{t("lilyOfferSave")}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setAccountModalOpen(true);
                                  dispensarOferta(message.id);
                                }}
                              >
                                {t("lilyOfferYes")}
                              </button>
                              <button
                                type="button"
                                className="button-muted"
                                onClick={() => dispensarOferta(message.id)}
                              >
                                {t("lilyOfferNo")}
                              </button>
                            </div>
                          )}
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
                        aria-label={t("lilyChatPlaceholder")}
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
            )}

            {view === "accounts" && (
              <section className="section-box">
                <div className="section-head">
                  <div>
                    <span className="section-kicker">{t("accountsKicker")}</span>
                    <h1>{t("registeredAccounts")}</h1>
                    <p>
                      {visibleAccounts.length}{" "}
                      {visibleAccounts.length === 1
                        ? t("accountsShowingOne")
                        : t("accountsShowingMany")}{" "}
                      —{" "}
                      {t("accountsFilterNote")}
                    </p>
                  </div>
                  <button type="button" onClick={handleNewAccount}>
                    {t("newService")}
                  </button>
                </div>

                <div className="accounts-toolbar">
                  <LabeledInput
                    id="accounts-search"
                    label={t("accountsSearchLabel")}
                    placeholder={t("searchVehicleClient")}
                    value={accountsSearch}
                    onChange={setAccountsSearch}
                  />
                  <SelectField
                    id="accounts-brand"
                    label={t("brandLabel")}
                    value={accountsBrandFilter}
                    onChange={setAccountsBrandFilter}
                  >
                    <option value="">{t("allBrands")}</option>
                    {marcas.map((marca) => (
                      <option key={marca} value={marca}>
                        {marca}
                      </option>
                    ))}
                  </SelectField>
                  <div>
                    <span className="field-label">{t("navModeGroup")}</span>
                    <div className="mode-switch" role="group" aria-label={t("navModeGroup")}>
                      <button
                        type="button"
                        className={isBlueMode ? "" : "is-on-yellow"}
                        aria-pressed={!isBlueMode}
                        onClick={() => toggleMode(false)}
                      >
                        {t("yellow")}
                      </button>
                      <button
                        type="button"
                        className={isBlueMode ? "is-on-blue" : ""}
                        aria-pressed={isBlueMode}
                        onClick={() => toggleMode(true)}
                      >
                        {t("blue")}
                      </button>
                    </div>
                  </div>
                </div>

                {accountsLoading ? (
                  <div className="empty-state">
                    <span className="empty-state-glyph" aria-hidden="true">
                      ◌
                    </span>
                    <h3>{t("loadingAccounts")}</h3>
                  </div>
                ) : visibleAccounts.length === 0 ? (
                  <div className="empty-state">
                    <span className="empty-state-glyph" aria-hidden="true">
                      {isFiltering || modeAccounts.length > 0 ? "⌕" : "◎"}
                    </span>
                    <h3>
                      {isFiltering || modeAccounts.length > 0
                        ? t("noResultsTitle")
                        : t("emptyAccountsTitle")}
                    </h3>
                    <p>
                      {isFiltering || modeAccounts.length > 0
                        ? t("noResultsHint")
                        : t("emptyAccountsHint")}
                    </p>
                    {!isFiltering && modeAccounts.length === 0 && (
                      <button type="button" onClick={handleNewAccount}>
                        {t("startNewService")}
                      </button>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="account-row-head" aria-hidden="true">
                      <span>{t("colVehicle")}</span>
                      <span>{t("colClient")}</span>
                      <span style={{ textAlign: "right" }}>{t("colTotal")}</span>
                      <span />
                    </div>

                    {visibleAccounts.map((account) => (
                      <div
                        key={account.id}
                        className={
                          account.id === selectedAccountId
                            ? "account-row is-selected"
                            : "account-row"
                        }
                      >
                        <button
                          type="button"
                          className="account-row-main"
                          aria-label={`${t("selectAccount")}: ${account.veiculo || t("noVehicle")}`}
                          onClick={() => handleSelectAccount(account)}
                        >
                          <span className="account-row-vehicle">
                            {account.veiculo || t("noVehicle")} —{" "}
                            {account.marca || t("general")}
                          </span>
                          <span className="account-row-meta">
                            {account.tipoPeca || t("notInformed")} ·{" "}
                            {formatDate(account.data, locale)}
                          </span>
                        </button>
                        <span className="account-row-client">
                          {account.clienteNome || t("walkIn")}
                        </span>
                        <span className="account-row-total">
                          {formatCurrency(account.total, locale)}
                        </span>
                        <span className="account-row-actions">
                          <button
                            type="button"
                            className="icon-btn"
                            aria-label={`${t("editAccount")}: ${account.veiculo || t("noVehicle")}`}
                            onClick={() => {
                              handleSelectAccount(account);
                              setAccountModalOpen(true);
                            }}
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            className="icon-btn danger"
                            aria-label={`${t("deleteAccountAction")}: ${account.veiculo || t("noVehicle")}`}
                            onClick={() => void handleDeleteAccount(account.id)}
                          >
                            ✕
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {view === "settings" && (
              <section className="section-box">
                <div className="section-head">
                  <div>
                    <span className="section-kicker">{t("settingsKicker")}</span>
                    <h1>{t("settings")}</h1>
                    <p>{t("settingsIntro")}</p>
                  </div>
                </div>
                <div className="section-body">
                  <div className="grid-settings">
                    <button
                      type="button"
                      className="setting-card"
                      onClick={() => openSettingsPage("hourly")}
                    >
                      <span className="setting-card-icon" aria-hidden="true">
                        ⏱
                      </span>
                      <h3>{t("hourlyValue")}</h3>
                      <p>{t("hourlyValueDesc")}</p>
                      <span className="setting-card-stat">
                        {formatCurrency(config.valorHora, locale)}
                        {t("perHourSuffix")}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="setting-card"
                      onClick={() => openSettingsPage("pieces")}
                    >
                      <span className="setting-card-icon" aria-hidden="true">
                        📦
                      </span>
                      <h3>{t("pieceTypes")}</h3>
                      <p>{t("pieceTypesDesc")}</p>
                      <span className="setting-card-stat">
                        {config.pecas.length}{" "}
                        {config.pecas.length === 1 ? t("pieceTypeOne") : t("pieceTypeMany")}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="setting-card"
                      onClick={() => openSettingsPage("clients")}
                    >
                      <span className="setting-card-icon" aria-hidden="true">
                        👤
                      </span>
                      <h3>{t("clients")}</h3>
                      <p>{t("clientsDesc")}</p>
                      <span className="setting-card-stat">
                        {config.clientes.length}{" "}
                        {config.clientes.length === 1 ? t("clientOne") : t("clientMany")}
                      </span>
                    </button>
                  </div>
                </div>
              </section>
            )}

            {view === "hourly" && (
              <section className="section-box">
                <div className="section-head">
                  <div>
                    <SettingsCrumb
                      label={t("settings")}
                      onBack={() => setView("settings")}
                    />
                    <h1>{t("hourlyValue")}</h1>
                    <p>{t("hourlyPageIntro")}</p>
                  </div>
                </div>
                <form
                  className="section-body hourly-panel"
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveHourly();
                  }}
                >
                  <div className="hourly-field">
                    <LabeledInput
                      id="settings-hour"
                      label={t("hourlyFieldLabel")}
                      placeholder={t("hourlyPlaceholder")}
                      value={hourlyDraft}
                      onChange={setHourlyDraft}
                    />
                    <p className="hourly-current">
                      {t("hourlyCurrent")}:{" "}
                      <strong>{formatCurrency(config.valorHora, locale)}</strong>
                      {t("perHourSuffix")}
                    </p>
                    <div className="hourly-actions">
                      <button
                        type="button"
                        className="button-muted"
                        disabled={!hourlyDirty}
                        onClick={() => setHourlyDraft(String(config.valorHora))}
                      >
                        {t("discardChanges")}
                      </button>
                      <button type="submit" disabled={!hourlyDirty}>
                        {t("save")}
                      </button>
                    </div>
                  </div>
                  <aside className="hourly-example">
                    <span className="section-kicker">{t("hourlyExampleKicker")}</span>
                    <p>{t("hourlyExampleText")}</p>
                    <div className="hourly-example-calc">
                      <span>8 h × {formatCurrency(hourlyDraftValue, locale)}</span>
                      <strong>{formatCurrency(8 * hourlyDraftValue, locale)}</strong>
                    </div>
                  </aside>
                </form>
              </section>
            )}

            {view === "pieces" && (
              <section className="section-box">
                <div className="section-head">
                  <div>
                    <SettingsCrumb
                      label={t("settings")}
                      onBack={() => setView("settings")}
                    />
                    <h1>{t("pieceTypes")}</h1>
                    <p>
                      {config.pecas.length}{" "}
                      {config.pecas.length === 1 ? t("pieceTypeOne") : t("pieceTypeMany")}{" "}
                      — {t("piecesPageIntro")}
                    </p>
                  </div>
                  <button type="button" onClick={() => openPieceModal("new")}>
                    {t("newPiece")}
                  </button>
                </div>

                <div className="accounts-toolbar toolbar-pieces">
                  <LabeledInput
                    id="pieces-search"
                    label={t("accountsSearchLabel")}
                    placeholder={t("searchPiece")}
                    value={piecesSearch}
                    onChange={setPiecesSearch}
                  />
                  <SelectField
                    id="pieces-sort"
                    label={t("sortBy")}
                    value={piecesSort}
                    onChange={(value) => setPiecesSort(value as "name" | "usage")}
                  >
                    <option value="name">{t("sortName")}</option>
                    <option value="usage">{t("sortUsage")}</option>
                  </SelectField>
                </div>

                {visiblePieces.length === 0 ? (
                  <div className="empty-state">
                    <span className="empty-state-glyph" aria-hidden="true">
                      {piecesQuery ? "⌕" : "◎"}
                    </span>
                    <h3>{piecesQuery ? t("noResultsTitle") : t("emptyPiecesTitle")}</h3>
                    <p>{piecesQuery ? t("noResultsHint") : t("emptyPiecesHint")}</p>
                    {!piecesQuery && (
                      <button type="button" onClick={() => openPieceModal("new")}>
                        {t("newPiece")}
                      </button>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="account-row-head cols-pieces" aria-hidden="true">
                      <span>{t("colPiece")}</span>
                      <span style={{ textAlign: "right" }}>{t("colAccounts")}</span>
                      <span />
                    </div>
                    {visiblePieces.map(({ piece, index, uso }) => (
                      <div key={`${piece}-${index}`} className="account-row cols-pieces">
                        <button
                          type="button"
                          className="account-row-main"
                          aria-label={`${t("editPiece")}: ${piece}`}
                          onClick={() => openPieceModal(index)}
                        >
                          <span className="account-row-vehicle">{piece}</span>
                        </button>
                        <span className="account-row-count">
                          {uso} {uso === 1 ? t("accountOne") : t("accountMany")}
                        </span>
                        <span className="account-row-actions">
                          <button
                            type="button"
                            className="icon-btn"
                            aria-label={`${t("editPiece")}: ${piece}`}
                            onClick={() => openPieceModal(index)}
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            className="icon-btn danger"
                            aria-label={`${t("removePieceAction")}: ${piece}`}
                            onClick={() => removePiece(index)}
                          >
                            ✕
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {view === "clients" && (
              <section className="section-box">
                <div className="section-head">
                  <div>
                    <SettingsCrumb
                      label={t("settings")}
                      onBack={() => setView("settings")}
                    />
                    <h1>{t("clients")}</h1>
                    <p>
                      {visibleClients.length}{" "}
                      {visibleClients.length === 1 ? t("clientOne") : t("clientMany")}
                      {clientsFiltering
                        ? ` ${t("ofTotal")} ${config.clientes.length}`
                        : ""}{" "}
                      — {t("clientsPageIntro")}
                    </p>
                  </div>
                  <button type="button" onClick={() => openClientModal("new")}>
                    {t("newClient")}
                  </button>
                </div>

                <div className="accounts-toolbar toolbar-clients">
                  <LabeledInput
                    id="clients-search"
                    label={t("accountsSearchLabel")}
                    placeholder={t("searchClient")}
                    value={clientsSearch}
                    onChange={setClientsSearch}
                  />
                  <div>
                    <span className="field-label">{t("clientTypeLabel")}</span>
                    <div className="mode-switch" role="group" aria-label={t("clientTypeLabel")}>
                      {(["", "PF", "PJ"] as const).map((tipo) => (
                        <button
                          key={tipo || "all"}
                          type="button"
                          className={clientsTypeFilter === tipo ? "is-on" : ""}
                          aria-pressed={clientsTypeFilter === tipo}
                          onClick={() => setClientsTypeFilter(tipo)}
                        >
                          {tipo || t("filterAll")}
                        </button>
                      ))}
                    </div>
                  </div>
                  <SelectField
                    id="clients-sort"
                    label={t("sortBy")}
                    value={clientsSort}
                    onChange={(value) =>
                      setClientsSort(value as "name" | "recent" | "usage")
                    }
                  >
                    <option value="name">{t("sortName")}</option>
                    <option value="recent">{t("sortRecent")}</option>
                    <option value="usage">{t("sortUsage")}</option>
                  </SelectField>
                </div>

                {visibleClients.length === 0 ? (
                  <div className="empty-state">
                    <span className="empty-state-glyph" aria-hidden="true">
                      {clientsFiltering ? "⌕" : "◎"}
                    </span>
                    <h3>
                      {clientsFiltering ? t("noResultsTitle") : t("emptyClientsTitle")}
                    </h3>
                    <p>{clientsFiltering ? t("noResultsHint") : t("emptyClientsHint")}</p>
                    {!clientsFiltering && (
                      <button type="button" onClick={() => openClientModal("new")}>
                        {t("newClient")}
                      </button>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="account-row-head cols-clients" aria-hidden="true">
                      <span>{t("colClient")}</span>
                      <span>{t("doc")}</span>
                      <span>{t("contact")}</span>
                      <span style={{ textAlign: "right" }}>{t("colAccounts")}</span>
                      <span />
                    </div>
                    {visibleClients.map((client) => {
                      const uso = usoDoCliente(client);
                      const apelido = client.tipo === "PF" ? client.apelido : client.fantasia;
                      return (
                        <div key={client.id} className="account-row cols-clients">
                          <button
                            type="button"
                            className="account-row-main"
                            aria-label={`${t("editClient")}: ${client.nome}`}
                            onClick={() => openClientModal(client)}
                          >
                            <span className="account-row-vehicle">{client.nome}</span>
                            {apelido && (
                              <span className="account-row-meta">{apelido}</span>
                            )}
                          </button>
                          <span className="account-row-client">
                            <span className="type-tag">{client.tipo}</span> {client.doc}
                          </span>
                          <span className="account-row-client">
                            {client.tel || t("noPhone")}
                            {client.email && (
                              <span className="account-row-meta">{client.email}</span>
                            )}
                          </span>
                          <span className="account-row-count">
                            {uso} {uso === 1 ? t("accountOne") : t("accountMany")}
                          </span>
                          <span className="account-row-actions">
                            <button
                              type="button"
                              className="icon-btn"
                              aria-label={`${t("editClient")}: ${client.nome}`}
                              onClick={() => openClientModal(client)}
                            >
                              ✎
                            </button>
                            <button
                              type="button"
                              className="icon-btn danger"
                              aria-label={`${t("removeClientAction")}: ${client.nome}`}
                              onClick={() => removeClient(client.id)}
                            >
                              ✕
                            </button>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
          </main>

          <section
            ref={gavetaRef}
            className={drawerOpen ? "calc-drawer is-open" : "calc-drawer"}
            aria-label={t("drawerTitle")}
          >
            <button
              type="button"
              className="calc-drawer-tab"
              aria-expanded={drawerOpen}
              aria-controls="calc-drawer-body"
              onClick={() => setDrawerOpen((prev) => !prev)}
            >
              <span className="calc-drawer-label">{t("drawerToggle")}</span>
              <span className="calc-drawer-sub">{drawerSummary}</span>
              <span className="calc-drawer-chev" aria-hidden="true">
                ▾
              </span>
            </button>

            {drawerOpen && (
              <div className="calc-drawer-body" id="calc-drawer-body">
                <div className="calc-drawer-head">
                  <span className="pill">
                    {isBlueMode ? t("drawerModeBlue") : t("drawerModeYellow")}
                  </span>
                  {selectedAccount && (
                    <span className="pill neutral">
                      {t("drawerAccount")}: {selectedAccount.veiculo || t("noVehicle")}
                      <button
                        type="button"
                        aria-label={t("drawerClearAccount")}
                        onClick={limparServico}
                      >
                        ×
                      </button>
                    </span>
                  )}
                </div>

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
                        label={t("inss")}
                        value={mainInputs.inss}
                        onChange={(value) =>
                          setMainInputs((prev) => ({ ...prev, inss: value }))
                        }
                      />
                    </>
                  )}
                </div>

                <div className="actions-grid">
                  <button type="button" onClick={handleCalculate}>
                    {t("calculate")}
                  </button>
                  <button
                    type="button"
                    className="button-muted"
                    onClick={() => setAccountModalOpen(true)}
                  >
                    {selectedAccount ? t("editAccount") : t("saveAccount")}
                  </button>
                  <button
                    type="button"
                    className="action-clear"
                    onClick={limparServico}
                  >
                    {t("clear")}
                  </button>
                </div>

                {results && (
                  <div className="resultado">
                    <h3>{isBlueMode ? t("blueResult") : t("yellowResult")}</h3>
                    <ResultRow
                      label={t("sellFor")}
                      value={formatCurrency(results.venda, locale)}
                    />
                    {selectedAccount?.vendidoPor && (
                      <ResultRow
                        label={t("soldFor")}
                        value={formatCurrency(
                          toNumber(selectedAccount.vendidoPor),
                          locale,
                        )}
                      />
                    )}
                    {selectedAccount?.maoDeObra && (
                      <ResultRow
                        label={t("labor")}
                        value={formatCurrency(
                          toNumber(selectedAccount.maoDeObra),
                          locale,
                        )}
                      />
                    )}
                    <ResultRow
                      label={t("cost")}
                      value={formatCurrency(results.custo, locale)}
                    />
                    <ResultRow
                      label={t("finalProfit")}
                      value={formatCurrency(results.lucro, locale)}
                      strong
                    />
                    {isBlueMode && results.montagem !== undefined && (
                      <>
                        <ResultRow
                          label={t("assembly")}
                          value={formatCurrency(results.montagem, locale)}
                        />
                        <ResultRow
                          label={t("coreAssembly")}
                          value={formatCurrency(results.cm ?? 0, locale)}
                        />
                        <ResultRow
                          label={t("assemblySale")}
                          value={formatCurrency(results.mv ?? 0, locale)}
                        />
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        </>
      )}

      {termsOpen && (
        <Dialog
          title={t("termsTitle")}
          kicker={t("termsGuide")}
          closeLabel={t("closeModal")}
          onClose={() => setTermsOpen(false)}
          footer={
            <>
              <span />
              <span />
              <button type="button" onClick={() => setTermsOpen(false)}>
                {t("termsAcceptButton")}
              </button>
            </>
          }
        >
          <div className="terms-copy">
            <div>
              <h3>{t("termsUseTitle")}</h3>
              <p>{t("termsUseText")}</p>
            </div>
            <div>
              <h3>{t("termsDataTitle")}</h3>
              <p>{t("termsDataText")}</p>
            </div>
            <div>
              <h3>{t("termsResponsibilityTitle")}</h3>
              <p>{t("termsResponsibilityText")}</p>
            </div>
          </div>
        </Dialog>
      )}

      {profileModalOpen && (
        <Dialog
          title={t("profileTitle")}
          kicker={t("userMenuAccount")}
          closeLabel={t("closeModal")}
          onClose={() => setProfileModalOpen(false)}
          footer={
            <>
              <span className="modal-status">
                {profileSaving ? t("profileSavingStatus") : ""}
              </span>
              <button
                type="button"
                className="button-muted"
                disabled={profileSaving}
                onClick={() => setProfileModalOpen(false)}
              >
                {t("profileCancel")}
              </button>
              <button
                type="button"
                disabled={profileSaving}
                onClick={() => void handleSaveProfile()}
              >
                {profileSaving ? t("profileSaving") : t("profileSave")}
              </button>
            </>
          }
        >
          <p className="modal-status">{t("profileSubtitle")}</p>

          <section className="form-section">
            <h3>{t("profilePhoto")}</h3>
            <p>{t("profilePhotoHint")}</p>
            <div
              style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}
            >
              <UserAvatar
                initial={userInitial}
                photoURL={profileForm.photoURL}
                className="large"
              />
              <label className="file-button">
                {t("profileChangePhoto")}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) =>
                    handleProfilePhotoChange(event.target.files?.[0])
                  }
                />
              </label>
              {profileForm.photoURL && (
                <button
                  type="button"
                  className="button-muted"
                  style={{ width: "auto" }}
                  onClick={() => {
                    setProfilePhotoFile(null);
                    setProfileForm((prev) => ({ ...prev, photoURL: "" }));
                  }}
                >
                  {t("profileRemovePhoto")}
                </button>
              )}
            </div>
          </section>

          <section className="form-section on-surface-2">
            <h3>{t("profileIdentity")}</h3>
            <span className="field-label">{t("profileType")}</span>
            <div className="account-type-switch">
              <button
                type="button"
                aria-pressed={profileForm.type === "PF"}
                className={profileForm.type === "PF" ? "is-active" : ""}
                onClick={() => setProfileForm((prev) => ({ ...prev, type: "PF" }))}
              >
                {t("personPf")}
              </button>
              <button
                type="button"
                aria-pressed={profileForm.type === "PJ"}
                className={profileForm.type === "PJ" ? "is-active" : ""}
                onClick={() => setProfileForm((prev) => ({ ...prev, type: "PJ" }))}
              >
                {t("personPj")}
              </button>
            </div>
            <div className="form-grid">
              <LabeledInput
                id="profile-name"
                label={t("profileName")}
                value={profileForm.nome}
                onChange={(value) =>
                  setProfileForm((prev) => ({ ...prev, nome: value }))
                }
              />
              <LabeledInput
                id="profile-doc"
                label={`${t("profileDoc")} (${profileForm.type === "PF" ? "CPF" : "CNPJ"})`}
                value={profileForm.doc}
                onChange={(value) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    doc: formatDoc(value, profileForm.type),
                  }))
                }
              />
              <LabeledInput
                id="profile-phone"
                label={t("profilePhone")}
                type="tel"
                value={profileForm.phone}
                onChange={(value) =>
                  setProfileForm((prev) => ({ ...prev, phone: formatPhone(value) }))
                }
              />
            </div>
          </section>

          <section className="form-section on-surface-2">
            <h3>{t("profileAccess")}</h3>
            <div className="form-grid">
              <LabeledInput
                id="profile-user"
                label={t("profileUser")}
                autoComplete="username"
                value={profileForm.user}
                onChange={(value) =>
                  setProfileForm((prev) => ({ ...prev, user: value }))
                }
              />
              <LabeledInput
                id="profile-email"
                label={t("profileEmail")}
                type="email"
                autoComplete="email"
                value={profileForm.email}
                onChange={(value) =>
                  setProfileForm((prev) => ({ ...prev, email: value }))
                }
              />
              <LabeledInput
                id="profile-current-password"
                label={t("profileCurrentPassword")}
                type="password"
                autoComplete="current-password"
                placeholder={t("profileCurrentPasswordPlaceholder")}
                value={profileForm.currentPassword}
                onChange={(value) =>
                  setProfileForm((prev) => ({ ...prev, currentPassword: value }))
                }
              />
              <LabeledInput
                id="profile-new-password"
                label={t("profileNewPassword")}
                type="password"
                autoComplete="new-password"
                placeholder={t("profilePasswordPlaceholder")}
                value={profileForm.newPassword}
                onChange={(value) =>
                  setProfileForm((prev) => ({ ...prev, newPassword: value }))
                }
              />
              <LabeledInput
                id="profile-confirm-password"
                label={t("profileConfirmPassword")}
                type="password"
                autoComplete="new-password"
                placeholder={t("profilePasswordPlaceholder")}
                value={profileForm.confirmPassword}
                onChange={(value) =>
                  setProfileForm((prev) => ({ ...prev, confirmPassword: value }))
                }
              />
            </div>
          </section>
        </Dialog>
      )}

      {accountModalOpen && (
        <Dialog
          title={accountModalTitle}
          kicker={selectedAccount ? t("editAccount") : t("newAccount")}
          closeLabel={t("closeModal")}
          size="wide"
          onClose={() => setAccountModalOpen(false)}
          footer={
            <>
              <span />
              <button
                type="button"
                className="button-muted"
                onClick={() => setAccountModalOpen(false)}
              >
                {t("cancel")}
              </button>
              <button type="button" onClick={() => void handleSaveAccount()}>
                {accountSaveLabel}
              </button>
            </>
          }
        >
          <div className="account-modal-grid on-surface-2">
            <section className="account-image-panel">
              <h3
                style={{
                  margin: 0,
                  color: "var(--primary)",
                  fontFamily: "var(--mono)",
                  fontSize: "0.68rem",
                  letterSpacing: "0.13em",
                  textTransform: "uppercase",
                }}
              >
                {t("accountImageTitle")}
              </h3>
              <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.82rem" }}>
                {t("accountImageSubtitle")}
              </p>

              <div className="account-image-preview">
                {accountImagePreview ? (
                  <img src={accountImagePreview} alt={accountImageFileName} />
                ) : (
                  <span>{t("accountImagePlaceholder")}</span>
                )}
              </div>

              <div className="account-image-status" aria-live="polite">
                {accountImageStatusText}
              </div>

              <div className="account-image-actions">
                <label className="file-button">
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
                <label className="file-button">
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
                  type="button"
                  disabled={!accountImagePreview || accountImageStatus === "analyzing"}
                  onClick={applyAccountImageRecognition}
                >
                  {t("accountImageAnalyze")}
                </button>
                {accountImagePreview && (
                  <button
                    type="button"
                    className="button-muted"
                    onClick={clearAccountImage}
                  >
                    {t("accountImageRemove")}
                  </button>
                )}
              </div>
            </section>

            <div style={{ display: "grid", gap: "16px", alignContent: "start" }}>
              <section className="form-section">
                <h3>{t("accountDataSection")}</h3>
                <div className="form-grid three">
                  <SelectField
                    id="account-brand"
                    label={t("brandLabel")}
                    value={accountForm.marca}
                    onChange={(value) =>
                      setAccountForm((prev) => ({ ...prev, marca: value }))
                    }
                  >
                    <option value="">{t("selectBrand")}</option>
                    {marcas.map((marca) => (
                      <option key={marca} value={marca}>
                        {marca}
                      </option>
                    ))}
                  </SelectField>

                  <LabeledInput
                    id="account-vehicle"
                    label={t("vehicleLabel")}
                    placeholder={t("vehicleName")}
                    value={accountForm.veiculo}
                    onChange={(value) =>
                      setAccountForm((prev) => ({ ...prev, veiculo: value }))
                    }
                  />

                  <SelectField
                    id="account-piece"
                    label={t("pieceTypeLabel")}
                    value={accountForm.tipoPeca}
                    onChange={(value) =>
                      setAccountForm((prev) => ({ ...prev, tipoPeca: value }))
                    }
                  >
                    <option value="">{t("selectPieceType")}</option>
                    {config.pecas.map((piece) => (
                      <option key={piece} value={piece}>
                        {piece}
                      </option>
                    ))}
                  </SelectField>
                </div>
              </section>

              <section className="form-section">
                <h3>{t("accountOwnerSection")}</h3>
                <div className="radio-row">
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
                  <div className="form-grid">
                    <SelectField
                      id="account-client"
                      label={t("registeredClientLabel")}
                      value={accountForm.clienteSelect}
                      onChange={(value) =>
                        setAccountForm((prev) => ({ ...prev, clienteSelect: value }))
                      }
                    >
                      <option value="">{t("selectRegisteredClient")}</option>
                      {config.clientes.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.nome} ({client.tipo})
                        </option>
                      ))}
                    </SelectField>
                    <LabeledInput
                      id="account-client-phone"
                      label={t("clientPhone")}
                      type="tel"
                      value={accountForm.clienteTelefone}
                      onChange={(value) =>
                        setAccountForm((prev) => ({
                          ...prev,
                          clienteTelefone: formatPhone(value),
                        }))
                      }
                    />
                  </div>
                )}
              </section>

              <section className="form-section">
                <h3>{t("accountValuesSection")}</h3>
                <div className="form-grid">
                  <LabeledInput
                    id="account-sold-by"
                    label={t("soldByValue")}
                    value={accountForm.vendidoPorInput}
                    onChange={(value) =>
                      setAccountForm((prev) => ({ ...prev, vendidoPorInput: value }))
                    }
                  />
                  <LabeledInput
                    id="account-labor"
                    label={t("laborValue")}
                    value={accountForm.maoDeObraInput}
                    onChange={(value) =>
                      setAccountForm((prev) => ({ ...prev, maoDeObraInput: value }))
                    }
                  />
                </div>
              </section>
            </div>
          </div>
        </Dialog>
      )}

      {pieceModal !== null && (
        <Dialog
          title={pieceModal === "new" ? t("newPieceTitle") : t("editPiece")}
          kicker={t("pieceTypes")}
          closeLabel={t("closeModal")}
          size="narrow"
          onClose={() => setPieceModal(null)}
          footer={
            <>
              <span />
              <button
                type="button"
                className="button-muted"
                onClick={() => setPieceModal(null)}
              >
                {t("cancel")}
              </button>
              <button type="submit" form="piece-form">
                {t("save")}
              </button>
            </>
          }
        >
          <form
            id="piece-form"
            onSubmit={(event) => {
              event.preventDefault();
              savePiece();
            }}
          >
            <LabeledInput
              id="settings-piece"
              label={t("pieceName")}
              placeholder={t("piecePlaceholder")}
              value={newPiece}
              onChange={setNewPiece}
            />
            {pieceModal !== "new" && usoDaPeca(config.pecas[pieceModal] ?? "") > 0 && (
              <p className="modal-status">{t("pieceRenameHint")}</p>
            )}
          </form>
        </Dialog>
      )}

      {clientModal !== null && (
        <Dialog
          title={clientModal === "new" ? t("registerClient") : t("editClient")}
          kicker={t("clients")}
          closeLabel={t("closeModal")}
          onClose={() => setClientModal(null)}
          footer={
            <>
              <span />
              <button
                type="button"
                className="button-muted"
                onClick={() => setClientModal(null)}
              >
                {t("cancel")}
              </button>
              <button type="button" onClick={saveClient}>
                {t("saveClient")}
              </button>
            </>
          }
        >
          <SelectField
            id="client-type"
            label={t("clientTypeLabel")}
            value={clientType}
            onChange={(value) => setClientType(value as ClientType)}
          >
            <option value="PF">{t("personPf")} (PF)</option>
            <option value="PJ">{t("personPj")} (PJ)</option>
          </SelectField>

          <div className="form-grid">
            {clientType === "PF" ? (
              <>
                <LabeledInput
                  id="client-name"
                  label={t("fullName")}
                  value={clientForm.nome}
                  onChange={(value) =>
                    setClientForm((prev) => ({ ...prev, nome: value }))
                  }
                />
                <LabeledInput
                  id="client-nickname"
                  label={t("nickname")}
                  value={clientForm.apelido}
                  onChange={(value) =>
                    setClientForm((prev) => ({ ...prev, apelido: value }))
                  }
                />
                <LabeledInput
                  id="client-cpf"
                  label="CPF"
                  value={clientForm.cpf}
                  onChange={(value) =>
                    setClientForm((prev) => ({ ...prev, cpf: formatCpf(value) }))
                  }
                />
              </>
            ) : (
              <>
                <LabeledInput
                  id="client-company"
                  label={t("companyName")}
                  value={clientForm.razaoSocial}
                  onChange={(value) =>
                    setClientForm((prev) => ({ ...prev, razaoSocial: value }))
                  }
                />
                <LabeledInput
                  id="client-trade"
                  label={t("tradeName")}
                  value={clientForm.nomeFantasia}
                  onChange={(value) =>
                    setClientForm((prev) => ({ ...prev, nomeFantasia: value }))
                  }
                />
                <LabeledInput
                  id="client-cnpj"
                  label="CNPJ"
                  value={clientForm.cnpj}
                  onChange={(value) =>
                    setClientForm((prev) => ({ ...prev, cnpj: formatCnpj(value) }))
                  }
                />
                <LabeledInput
                  id="client-ie"
                  label={t("stateRegistration")}
                  value={clientForm.inscEstadual}
                  onChange={(value) =>
                    setClientForm((prev) => ({ ...prev, inscEstadual: value }))
                  }
                />
              </>
            )}

            <LabeledInput
              id="client-phone"
              label={t("phone")}
              type="tel"
              value={clientForm.tel}
              onChange={(value) =>
                setClientForm((prev) => ({ ...prev, tel: formatPhone(value) }))
              }
            />
            <LabeledInput
              id="client-email"
              label={t("email")}
              type="email"
              value={clientForm.email}
              onChange={(value) =>
                setClientForm((prev) => ({ ...prev, email: value }))
              }
            />
            <LabeledInput
              id="client-address"
              label={t("address")}
              value={clientForm.endereco}
              onChange={(value) =>
                setClientForm((prev) => ({ ...prev, endereco: value }))
              }
            />
          </div>

        </Dialog>
      )}
    </div>
  );
}

export default App;
