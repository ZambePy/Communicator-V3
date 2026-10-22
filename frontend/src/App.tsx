import React, { Suspense, lazy } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GazeProvider } from './context/GazeContext';
import { AuthProvider } from './context/AuthContext';
import { LicenseProvider } from './context/LicenseContext';
import { ProtectedRoute } from './components/ui/ProtectedRoute';
import { SoComLazer } from './components/ui/SoComLazer';
import { TransicaoDeRota } from './components/ui/TransicaoDeRota';
import { FechaPaineisAoNavegar } from './components/FechaPaineisAoNavegar';
import { VarreduraComAcionador } from './components/VarreduraComAcionador';
// A tela de emergência NÃO é carregada sob demanda: se o pedaço de código dela
// falhasse ao baixar (disco cheio, antivírus, atualização pela metade), a rota
// do socorro virava a fronteira de erro (auditoria de 18/10/2026, item 6). O
// envio e o alarme já não dependem dela, mas o paciente precisa VER o estado.
import { EmergencyEscalation } from './pages/output/EmergencyEscalation';
import { PreparoGate } from './pages/setup/PreparoGate';
import { GraceBanner } from './components/ui/GraceBanner';
import { AvisoDeBloqueio } from './components/AvisoDeBloqueio';
import { TravaDoCuidador } from './components/TravaDoCuidador';
import { FronteiraDeErroDaTela } from './components/FronteiraDeErroDaTela';
import { SettingsProvider } from './context/SettingsContext';
import { ToastProvider } from './context/ToastContext';
import { FaixaDeApresentacao } from './components/FaixaDeApresentacao';
import { ConviteDeRelatos } from './components/ConviteDeRelatos';
import { FaixaDeAtualizacao } from './components/FaixaDeAtualizacao';
import { AvisoDeFalaQueNaoSaiu } from './components/AvisoDeFalaQueNaoSaiu';
import { AvisoDeGravacao } from './components/AvisoDeGravacao';
import { AvisoDaSaidaDaVoz } from './components/AvisoDaSaidaDaVoz';
import { ReminderProvider } from './context/ReminderContext';
import { EmergencyProvider } from './context/EmergencyContext';
import { CloudProvider } from './cloud/CloudContext';
import { CloudBanners } from './cloud/CloudBanners';
import { PerguntaDoCuidador } from './components/PerguntaDoCuidador';
import { DebugHUD } from './components/DebugHUD';
import { PreflightPanel } from './components/PreflightPanel';
import { FatigueIndicator } from './components/FatigueIndicator';
import { RegistroDeUso } from './components/RegistroDeUso';

// Ondas de onboarding carregadas cedo — poucas telas, alta chance de uso imediato
import { InitialSplash } from './pages/onboarding/InitialSplash';
import { LoginScreen } from './pages/auth/LoginScreen';
// /menu, /menu-completo e /hospital. O desvio do /menu para a tela do hospital é
// minúsculo, e é ele que decide se o MainMenu (lazy, abaixo) chega a ser baixado.
import { rotasDoInicio } from './pages/core/rotasDoInicio';

// Lazy loading — Vite fatia o bundle por rota.
// Os módulos exportam como named export; envolvemos para satisfazer o contrato do lazy().
// O módulo pode exportar outras coisas além de componentes (listas de frases,
// por exemplo); só o export pedido precisa ser um componente.
type AnyComponent = React.ComponentType<Record<string, never>>;
const lazyNamed = <M extends Record<string, unknown>, K extends keyof M & string>(
  loader: () => Promise<M>,
  name: M[K] extends AnyComponent ? K : never
) =>
  lazy(async () => {
    const mod = await loader();
    return { default: mod[name] as AnyComponent };
  });

const MainMenu = lazyNamed(() => import('./pages/MainMenu'), 'MainMenu');
const WelcomeScreen = lazyNamed(() => import('./pages/WelcomeScreen'), 'WelcomeScreen');
const KeyboardScreen = lazyNamed(() => import('./pages/KeyboardScreen'), 'KeyboardScreen');
const QuickPhrasesScreen = lazyNamed(
  () => import('./pages/QuickPhrasesScreen'),
  'QuickPhrasesScreen'
);
const ComunicacaoScreen = lazyNamed(() => import('./pages/core/ComunicacaoScreen'), 'ComunicacaoScreen');
const SimNaoScreen = lazyNamed(() => import('./pages/core/SimNaoScreen'), 'SimNaoScreen');
const TecladoLateral = lazyNamed(() => import('./pages/core/TecladoLateral'), 'TecladoLateral');
const MapaDaDorScreen = lazyNamed(() => import('./pages/core/MapaDaDorScreen'), 'MapaDaDorScreen');
const HospitalScreen = lazyNamed(() => import('./pages/core/HospitalScreen'), 'HospitalScreen');
const MinhaVozScreen = lazyNamed(() => import('./pages/core/MinhaVozScreen'), 'MinhaVozScreen');
const GravarVozScreen = lazyNamed(() => import('./pages/core/GravarVozScreen'), 'GravarVozScreen');
const SettingsScreen = lazyNamed(() => import('./pages/SettingsScreen'), 'SettingsScreen');
const GamesMenu = lazyNamed(() => import('./pages/GamesMenu'), 'GamesMenu');
const BubblePopGame = lazyNamed(() => import('./pages/BubblePopGame'), 'BubblePopGame');
const TutorialWizard = lazyNamed(() => import('./pages/tutorial/TutorialWizard'), 'TutorialWizard');
const ProfileSelect = lazyNamed(() => import('./pages/auth/ProfileSelect'), 'ProfileSelect');
const IntroScreen = lazyNamed(() => import('./pages/onboarding/IntroScreen'), 'IntroScreen');
const ConsentScreen = lazyNamed(() => import('./pages/onboarding/ConsentScreen'), 'ConsentScreen');
const ActivatedScreen = lazyNamed(() => import('./pages/auth/ActivatedScreen'), 'ActivatedScreen');
const SetupWizard = lazyNamed(() => import('./pages/setup/SetupWizard'), 'SetupWizard');
const ResultadoDaCalibracao = lazyNamed(
  () => import('./pages/calibration/ResultadoDaCalibracao'),
  'ResultadoDaCalibracao'
);
const ContaEAssinatura = lazyNamed(
  () => import('./pages/conta/ContaEAssinatura'),
  'ContaEAssinatura'
);
const RelatorioDaSessao = lazyNamed(
  () => import('./pages/relatorio/RelatorioDaSessao'),
  'RelatorioDaSessao'
);
const ChecagemRapida = lazyNamed(() => import('./pages/retomada/ChecagemRapida'), 'ChecagemRapida');
const ConversationScreen = lazyNamed(
  () => import('./pages/caregiver/ConversationScreen'),
  'ConversationScreen'
);
const VoiceControlScreen = lazyNamed(
  () => import('./pages/core/EmBreveScreen'),
  'VoiceControlScreen'
);
const AccessibilityScreen = lazyNamed(
  () => import('./pages/acessibilidade/AcessibilidadeScreen'),
  'AccessibilityScreen'
);
const HistoricoDeSessoes = lazyNamed(
  () => import('./pages/historico/HistoricoDeSessoes'),
  'HistoricoDeSessoes'
);
const EvolucaoScreen = lazyNamed(
  () => import('./pages/evolucao/EvolucaoScreen'),
  'EvolucaoScreen'
);
const ConsultaScreen = lazyNamed(
  () => import('./pages/consulta/ConsultaScreen'),
  'ConsultaScreen'
);
const CalibrationCheck = lazyNamed(
  () => import('./pages/onboarding/CalibrationCheck'),
  'CalibrationCheck'
);
const FollowTarget = lazyNamed(() => import('./pages/games/FollowTarget'), 'FollowTarget');
const MemoryGame = lazyNamed(() => import('./pages/games/MemoryGame'), 'MemoryGame');
const DrawingGame = lazyNamed(() => import('./pages/games/DrawingGame'), 'DrawingGame');
const MyOptionsScreen = lazyNamed(() => import('./pages/core/MyOptionsScreen'), 'MyOptionsScreen');
const PictogramScreen = lazyNamed(() => import('./pages/core/PictogramScreen'), 'PictogramScreen');
const RestScreen = lazyNamed(() => import('./pages/core/RestScreen'), 'RestScreen');
const GalleryScreen = lazyNamed(
  () => import('./pages/entertainment/GalleryScreen'),
  'GalleryScreen'
);
const PhotoCaptureScreen = lazyNamed(
  () => import('./pages/entertainment/PhotoCaptureScreen'),
  'PhotoCaptureScreen'
);
const NewsScreen = lazyNamed(() => import('./pages/entertainment/NewsScreen'), 'NewsScreen');
const CaregiverDashboard = lazyNamed(
  () => import('./pages/caregiver/CaregiverDashboard'),
  'CaregiverDashboard'
);
const CaregiverGuide = lazyNamed(
  () => import('./pages/caregiver/CaregiverGuide'),
  'CaregiverGuide'
);
const MeditationScreen = lazyNamed(
  () => import('./pages/health/MeditationScreen'),
  'MeditationScreen'
);
const VirtualMouseScreen = lazyNamed(
  () => import('./pages/VirtualMouseScreen'),
  'VirtualMouseScreen'
);
const VozScreen = lazyNamed(() => import('./pages/settings/VozScreen'), 'VozScreen');

const RouteFallback: React.FC = () => (
  <div
    role="status"
    aria-live="polite"
    style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      // Era um gradiente CLARO de tela cheia. Como todas as rotas são
      // `lazy`, ele piscava a cada troca de tela — num app cujo argumento
      // clínico é justamente não saturar a pupila.
      background: 'var(--settings-bg)',
      color: 'var(--color-primary)',
      fontSize: '1.1rem',
      fontWeight: 700,
    }}
  >
    Carregando…
  </div>
);

// O `Protected` que morava aqui era `({ children }) => <>{children}</>`: toda
// rota "protegida" era publica, e bastava digitar a URL para chegar ao menu sem
// licenca, sem consentimento e sem perfil. O portao de verdade esta em
// `components/ui/ProtectedRoute`, com a ordem das verificacoes sob teste.

/**
 * Router da aplicação.
 *
 * **`HashRouter`, não `BrowserRouter`.** No build empacotado o Electron faz
 * `win.loadFile(...)`, então o app roda sob `file://`. `BrowserRouter` usa a
 * history API: `navigate('/menu')` produz `file:///menu`, um caminho que não
 * existe no disco. Qualquer reload, crash-recovery do Chromium ou
 * `location.reload()` cai em "file not found" e o app morre em **tela branca**,
 * sem console para o cuidador diagnosticar.
 *
 * Com `HashRouter` a rota vive depois do `#`, que o `file://` ignora: o
 * documento carregado é sempre o mesmo `index.html`.
 *
 * Exportado para o teste poder afirmar a escolha. A verificação definitiva é
 * manual, num build empacotado — o plano registra este item como *suspeita*
 * justamente porque o pacote não foi executado na análise. Mas o par
 * `BrowserRouter` + `loadFile` é incompatível por construção, e a alternativa
 * (protocolo customizado via `loadURL`) é bem mais invasiva.
 */
export const AppRouter = HashRouter;

function App() {
  return (
    <LicenseProvider>
      <AuthProvider>
        <SettingsProvider>
          <ToastProvider>
            <GazeProvider>
              {/* Nuvem (conversa com o cuidador, socorro, resumo da calibração).
                  Dentro do GazeProvider — lê o engine para o heartbeat — e
                  abaixo do LicenseProvider — segue a licença. Fora do router:
                  a mensagem do cuidador é falada em qualquer tela. Sem
                  VITE_SUPABASE_URL é inerte. */}
              <CloudProvider>
                <ReminderProvider>
                  <AppRouter>
                    <EmergencyProvider>
                      <FaixaDeApresentacao />
                      <ConviteDeRelatos />
                      <FaixaDeAtualizacao />
                      {/* Falhas que antes só iam para o console (auditoria de
                          18/10/2026, itens 5 e 15): a frase que não saiu em voz
                          alta, em letra grande, e o que não pôde ser salvo. */}
                      <AvisoDeFalaQueNaoSaiu />
                      <AvisoDeGravacao />
                      <AvisoDaSaidaDaVoz />
                      <GraceBanner />
                      <AvisoDeBloqueio />
                      <TravaDoCuidador />
                      <CloudBanners />
                      {/* Pergunta sim/não do cuidador (21/10/2026): espera
                          fora da emergência e da calibração, e fica sempre
                          abaixo da Emergência. */}
                      <PerguntaDoCuidador />
                      <FechaPaineisAoNavegar />
                      {/* Plano B: varredura com acionador (só com o ajuste ligado). */}
                      <VarreduraComAcionador />
                      <DebugHUD />
                      <PreflightPanel />
                      <FatigueIndicator />
                      <RegistroDeUso />
                      <Suspense fallback={<RouteFallback />}>
                        {/* A troca de tela ganha uma entrada curta (fade +
                          deslize). O contêiner é irmão do botão de emergência
                          e das faixas de aviso, que ficam acima dele e não
                          entram na animação — ver `TransicaoDeRota`. */}
                        <TransicaoDeRota>
                          <FronteiraDeErroDaTela>
                          <Routes>
                            {/* Onboarding — públicas */}
                            <Route path="/" element={<InitialSplash />} />
                            <Route path="/intro" element={<IntroScreen />} />
                            <Route path="/login" element={<LoginScreen />} />
                            <Route path="/activated" element={<ActivatedScreen />} />
                            <Route path="/consent" element={<ConsentScreen />} />
                            <Route
                              path="/tutorial"
                              element={
                                <ProtectedRoute>
                                  <TutorialWizard />
                                </ProtectedRoute>
                              }
                            />
                            <Route path="/profiles" element={<ProfileSelect />} />
                            <Route
                              path="/calibration-check"
                              element={
                                <ProtectedRoute>
                                  {/* O preparo bloqueia a CALIBRAÇÃO, não o app:
                                  calibrar num ambiente não conferido produz um
                                  mapeamento ruim que o paciente carrega pela
                                  sessão inteira, sem ter como diagnosticar. */}
                                  <PreparoGate>
                                    <CalibrationCheck />
                                  </PreparoGate>
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/calibration/resultado"
                              element={
                                <ProtectedRoute>
                                  <ResultadoDaCalibracao />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/conta"
                              element={
                                <ProtectedRoute requireCaregiver>
                                  <ContaEAssinatura />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/retomada"
                              element={
                                <ProtectedRoute>
                                  <ChecagemRapida />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/historico"
                              element={
                                <ProtectedRoute requireCaregiver>
                                  <HistoricoDeSessoes />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/relatorio"
                              element={
                                <ProtectedRoute requireCaregiver>
                                  <RelatorioDaSessao />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/evolucao"
                              element={
                                <ProtectedRoute requireCaregiver>
                                  <EvolucaoScreen />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/consulta"
                              element={
                                <ProtectedRoute>
                                  <ConsultaScreen />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/setup"
                              element={
                                <ProtectedRoute>
                                  <SetupWizard />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/welcome"
                              element={
                                <ProtectedRoute>
                                  <WelcomeScreen />
                                </ProtectedRoute>
                              }
                            />

                            {/* Menu Principal (/menu, que com o modo hospital ligado leva à tela do
                                quarto), menu completo (/menu-completo) e tela do hospital
                                (/hospital): rodada 3, 21/10/2026. Ver `rotasDoInicio`. */}
                            {rotasDoInicio({ MenuCompleto: MainMenu, Hospital: HospitalScreen, Portao: ProtectedRoute })}

                            {/* Modo Descanso */}
                            <Route
                              path="/rest"
                              element={
                                <ProtectedRoute>
                                  <RestScreen />
                                </ProtectedRoute>
                              }
                            />

                            {/* Comunicação */}
                            <Route
                              path="/keyboard"
                              element={
                                <ProtectedRoute>
                                  <KeyboardScreen />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/phrases"
                              element={
                                <ProtectedRoute>
                                  <QuickPhrasesScreen />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/comunicacao"
                              element={
                                <ProtectedRoute>
                                  <ComunicacaoScreen />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/sim-nao"
                              element={
                                <ProtectedRoute>
                                  <SimNaoScreen />
                                </ProtectedRoute>
                              }
                            />
                            {/* Modo só horizontal (21/10/2026): o alfabeto por divisão binária. */}
                            <Route
                              path="/teclado-lateral"
                              element={
                                <ProtectedRoute>
                                  <TecladoLateral />
                                </ProtectedRoute>
                              }
                            />
                            {/* Mapa da dor e voz guardada (19/10/2026), pelo hub da Comunicação. */}
                            <Route
                              path="/dor"
                              element={
                                <ProtectedRoute>
                                  <MapaDaDorScreen />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/minha-voz"
                              element={
                                <ProtectedRoute>
                                  <MinhaVozScreen />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/minha-voz/gravar"
                              element={
                                <ProtectedRoute>
                                  <GravarVozScreen />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/pictograms"
                              element={
                                <ProtectedRoute>
                                  <PictogramScreen />
                                </ProtectedRoute>
                              }
                            />
                            {/* Emergência FORA do portão de licença, termo e
                                perfil: o alarme local não depende de conta.
                                Com a licença bloqueada (7 dias sem internet,
                                assinatura vencida, cofre ilegível) ou ainda em
                                verificação, esta rota mandava para o login — e
                                o paciente perdia o único pedido de socorro que
                                funciona sem ninguém digitar senha. Sem vínculo
                                o pedido não sai daqui, e a tela diz isso. */}
                            <Route path="/emergency" element={<EmergencyEscalation />} />
                            <Route
                              path="/options"
                              element={
                                <ProtectedRoute>
                                  <MyOptionsScreen />
                                </ProtectedRoute>
                              }
                            />

                            {/* Saúde e Cuidador */}
                            <Route
                              path="/caregiver"
                              element={
                                <ProtectedRoute>
                                  <CaregiverDashboard />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/voice"
                              element={
                                <ProtectedRoute>
                                  <VoiceControlScreen />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/accessibility"
                              element={
                                <ProtectedRoute>
                                  <AccessibilityScreen />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/conversation"
                              element={
                                <ProtectedRoute>
                                  <ConversationScreen />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/caregiver/guide"
                              element={
                                <ProtectedRoute requireCaregiver>
                                  <CaregiverGuide />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/meditation"
                              element={
                                <ProtectedRoute>
                                  <SoComLazer>
                                    <MeditationScreen />
                                  </SoComLazer>
                                </ProtectedRoute>
                              }
                            />
                            {/* "Estou bem" não tem tela própria: é uma das respostas prontas
                                da Conversa, que chega ao celular do cuidador pelo mesmo
                                caminho. A antiga /iamok não tinha caminho pela interface e
                                disparava sozinha em 30 s (FE-23). */}

                            {/* Lazer */}
                            <Route
                              path="/games"
                              element={
                                <ProtectedRoute>
                                  <GamesMenu />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/games/bubble"
                              element={
                                <ProtectedRoute>
                                  <SoComLazer>
                                    <BubblePopGame />
                                  </SoComLazer>
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/games/follow"
                              element={
                                <ProtectedRoute>
                                  <SoComLazer>
                                    <FollowTarget />
                                  </SoComLazer>
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/games/memory"
                              element={
                                <ProtectedRoute>
                                  <SoComLazer>
                                    <MemoryGame />
                                  </SoComLazer>
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/drawing"
                              element={
                                <ProtectedRoute>
                                  <SoComLazer>
                                    <DrawingGame />
                                  </SoComLazer>
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/gallery"
                              element={
                                <ProtectedRoute>
                                  <SoComLazer>
                                    <GalleryScreen />
                                  </SoComLazer>
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/photo"
                              element={
                                <ProtectedRoute>
                                  <SoComLazer>
                                    <PhotoCaptureScreen />
                                  </SoComLazer>
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/news"
                              element={
                                <ProtectedRoute>
                                  <SoComLazer>
                                    <NewsScreen />
                                  </SoComLazer>
                                </ProtectedRoute>
                              }
                            />

                            {/* Sistema */}
                            <Route
                              path="/settings"
                              element={
                                <ProtectedRoute>
                                  <SettingsScreen />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/settings/voice"
                              element={
                                <ProtectedRoute requireCaregiver>
                                  <VozScreen />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/virtual-mouse"
                              element={
                                <ProtectedRoute>
                                  <VirtualMouseScreen />
                                </ProtectedRoute>
                              }
                            />

                            {/* Rota desconhecida → menu. Antes era tela vazia:
                                um hash errado (link velho, `/camera` e
                                `/games/photo` que saíram) deixava o paciente
                                numa tela em branco sem alvo nenhum. */}
                            <Route path="*" element={<Navigate to="/menu" replace />} />
                          </Routes>
                          </FronteiraDeErroDaTela>
                        </TransicaoDeRota>
                      </Suspense>
                    </EmergencyProvider>
                  </AppRouter>
                </ReminderProvider>
              </CloudProvider>
            </GazeProvider>
          </ToastProvider>
        </SettingsProvider>
      </AuthProvider>
    </LicenseProvider>
  );
}

export default App;
