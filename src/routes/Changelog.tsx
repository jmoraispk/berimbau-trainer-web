import { Link } from 'wouter';
import { useI18n } from '@/i18n';

/**
 * Changelog — what shipped, plus a pointer back to v1 (Python+Kivy)
 * for context. Authored as a static structure so each release just
 * adds an entry at the top.
 *
 * Each highlight is an emoji-tagged headline with an optional list of
 * sub-bullets for the supporting detail. Emojis vary so adjacent
 * cards don't read as a wall of identical glyphs.
 *
 * Bilingual: each entry carries an `en` and `pt` block, picked at
 * render time off the active locale. The version / date / link href
 * are language-agnostic and live on the entry directly.
 */

interface Highlight {
  emoji?: string;
  title: string;
  details?: string[];
}

interface LangBlock {
  title: string;
  body?: string;
  highlights?: Highlight[];
  /** Label shown for the GitHub release link (when `linkHref` is set). */
  linkLabel?: string;
}

interface Entry {
  version: string;
  date: string;
  linkHref?: string;
  en: LangBlock;
  pt: LangBlock;
}

const ENTRIES: Entry[] = [
  {
    version: 'v0.3',
    date: '2026-05-06',
    linkHref: 'https://github.com/jmoraispk/berimbau-trainer-web/releases/tag/v0.3',
    en: {
      title: 'Accounts, payments, and a tidier home',
      linkLabel: 'v0.3 release notes on GitHub',
      highlights: [
        {
          emoji: '👤',
          title: 'User accounts',
          details: [
            'Sign up with email + password or Google.',
            'Profile and practice history sync across devices.',
            'Local-first stays the default — the app is fully usable signed-out.',
          ],
        },
        {
          emoji: '💳',
          title: 'Plans page at /subscribe — Free, $5 / month, $48 / year',
          details: [
            'Annual is marked Recommended with a "save 20%" pill.',
            '7-day free trial on every paid plan — no card charged for the first week.',
            'FAQ accordion covers cancellation, refunds, and what Early Access unlocks.',
          ],
        },
        {
          emoji: '🚪',
          title: 'Cancel any time from Settings → Manage',
          details: [
            'Stripe Customer Portal handles the cancel + invoice flow.',
            'Once canceled, Settings reads "Early Access — canceling, ends [date]" so the state is visible.',
          ],
        },
        {
          emoji: '🏆',
          title: 'Leaderboard plumbing',
          details: [
            'Opt-in via the new "Anonymous on leaderboard" toggle in Settings.',
            'Scores still count when anonymous; only the display name is hidden.',
          ],
        },
        {
          emoji: '⚙️',
          title: 'Settings reorganized into collapsible menus',
          details: [
            'Sections: Account · Audio & microphone · Leaderboard · Data · Install.',
            'Microphone picker, calibration profile and history/backup are grouped instead of scattered.',
            'The "Display / Real rhythm" toggle is gone — the visual shift is now always on.',
          ],
        },
        {
          emoji: '🎚️',
          title: 'Calibration cycle controls',
          details: [
            'Cycle length configurable 1–10 s via a − / + stepper, auto-pauses while you dial it in.',
            'Live countdown beside the pause button.',
            'Post-strike "rewind" animation is gone — the ring snaps to empty and the next prep starts immediately.',
            'Off-beat strikes flash red on the ring instead of being dropped silently.',
          ],
        },
        {
          emoji: '✨',
          title: 'Sign-in screen polish',
          details: [
            'Google "G" branding on the OAuth button.',
            '"Register" / "Criar conta" replaces "Sign up".',
            'Magic-link mode dropped — Sign in / Register / Google only.',
          ],
        },
        {
          emoji: '📱',
          title: 'Mobile — more breathing room on Home',
          details: [
            'Extra top padding so the language / sign-in / settings cluster stops crowding the logo on phones.',
          ],
        },
        {
          emoji: '📡',
          title: 'Errors and performance',
          details: [
            'Sentry hooked up — lazy-loaded, 0 KB without the DSN.',
            'Vercel Speed Insights reports Core Web Vitals.',
          ],
        },
        {
          emoji: '🩹',
          title: 'Bug fixes',
          details: [
            'Favicon precache list corrected — installed PWAs no longer fall back to the default icon.',
            'Edge-function CORS allowlist now permits apikey + x-client-info headers, fixing "Failed to send a request to the Edge Function" on Subscribe.',
          ],
        },
      ],
    },
    pt: {
      title: 'Contas, pagamentos e uma home mais arrumada',
      linkLabel: 'Notas da versão v0.3 no GitHub',
      highlights: [
        {
          emoji: '👤',
          title: 'Contas de usuário',
          details: [
            'Crie uma conta com e-mail + senha ou Google.',
            'Perfil e histórico de prática sincronizam entre dispositivos.',
            'Local-first segue como padrão — o app funciona sem conta.',
          ],
        },
        {
          emoji: '💳',
          title: 'Página de planos em /subscribe — Grátis, US$ 5/mês, US$ 48/ano',
          details: [
            'O plano anual aparece como Recomendado com a etiqueta "save 20%".',
            '7 dias grátis em todo plano pago — nada é cobrado na primeira semana.',
            'FAQ embaixo dos cards cobre cancelamento, reembolso e o que o Early Access desbloqueia.',
          ],
        },
        {
          emoji: '🚪',
          title: 'Cancele quando quiser em Configurações → Gerenciar',
          details: [
            'O Customer Portal da Stripe cuida do cancelamento e das faturas.',
            'Após cancelar, Configurações mostra "Early Access — cancelando, termina em [data]" para deixar o estado claro.',
          ],
        },
        {
          emoji: '🏆',
          title: 'Estrutura do ranking',
          details: [
            'Adesão pelo novo botão "Anônimo no ranking" em Configurações.',
            'As pontuações ainda contam quando você está anônimo; só o nome de exibição é ocultado.',
          ],
        },
        {
          emoji: '⚙️',
          title: 'Configurações reorganizadas em menus colapsáveis',
          details: [
            'Seções: Conta · Áudio e microfone · Ranking · Dados · Instalar.',
            'Seletor de microfone, perfil de calibração e histórico/backup agora ficam agrupados.',
            'O botão "Exibição / Ritmo real" foi removido — o deslocamento visual está sempre ligado.',
          ],
        },
        {
          emoji: '🎚️',
          title: 'Controles do ciclo de calibração',
          details: [
            'Duração do ciclo configurável de 1 a 10 s com um stepper − / +; pausa sozinho enquanto você ajusta.',
            'Contador ao vivo ao lado do botão de pausa.',
            'O "rebobinar" depois da batida foi removido — o anel zera e o próximo prep começa imediatamente.',
            'Batidas fora do tempo piscam em vermelho no anel em vez de serem ignoradas em silêncio.',
          ],
        },
        {
          emoji: '✨',
          title: 'Tela de login mais polida',
          details: [
            'Logotipo "G" do Google no botão de OAuth.',
            '"Criar conta" substitui "Sign up".',
            'Modo de magic-link foi removido — Entrar / Criar conta / Google.',
          ],
        },
        {
          emoji: '📱',
          title: 'Mobile — mais espaço no topo da Home',
          details: [
            'Padding extra no topo para que o cluster de idioma / entrar / configurações pare de empurrar o logo nos celulares.',
          ],
        },
        {
          emoji: '📡',
          title: 'Erros e desempenho',
          details: [
            'Sentry conectado — carregado tarde, 0 KB sem o DSN.',
            'Vercel Speed Insights reporta Core Web Vitals.',
          ],
        },
        {
          emoji: '🩹',
          title: 'Correções',
          details: [
            'Lista de pré-cache do favicon corrigida — PWAs instalados não voltam mais para o ícone padrão.',
            'Allowlist de CORS da edge function agora permite os headers apikey + x-client-info, corrigindo o erro "Failed to send a request to the Edge Function" no Subscribe.',
          ],
        },
      ],
    },
  },
  {
    version: 'v0.2',
    date: '2026-05-04',
    linkHref: 'https://github.com/jmoraispk/berimbau-trainer-web/releases/tag/v0.2',
    en: {
      title: 'A bigger app',
      linkLabel: 'v0.2 release notes on GitHub',
      highlights: [
        {
          emoji: '⌨️',
          title: 'On-screen keys when the mic isn\'t available',
          details: [
            'Mic-to-keyboard fallback in Practice — if mic permission is denied or the device has none, the app shows on-screen keys you can tap to play instead.',
          ],
        },
        {
          emoji: '🎓',
          title: 'Take a class — the first guided class is live',
          details: [
            'Chant a-e-i-o-u over São Bento Grande de Angola.',
            'Three parts: forward, reverse, combined.',
            'Repeat toggle and auto-advance between parts.',
          ],
        },
        {
          emoji: '🥁',
          title: 'Play-along mode in the practice toolbar',
          details: [
            'Plays the toque sounds on the beat so you have something to follow instead of practicing in silence.',
          ],
        },
        {
          emoji: '▶️',
          title: 'Practice auto-starts on tap',
          details: [
            'Single Start button — no more "Ready?" intermediate screen.',
          ],
        },
        {
          emoji: '🌊',
          title: 'Calibration scatter plot redone properly',
          details: [
            'Numbered axes.',
            'Same TCH × / DONG ○ / DING ● glyphs as the rest of the app.',
            'Hover tooltip with f0 and centroid.',
            'Click anywhere to play the strike back.',
            'Cross-highlight with the waveform thumbnails above.',
          ],
        },
        {
          emoji: '🧭',
          title: 'New top-level destinations from the footer',
          details: [
            'Take a class · Leaderboard · Roadmap (vertical timeline with status pills) · Changelog · About.',
          ],
        },
        {
          emoji: '🎤',
          title: 'Mic input picker in Settings',
          details: [
            'Choose which microphone the app listens through.',
          ],
        },
        {
          emoji: '📈',
          title: 'Live mic level meter during calibration',
          details: [
            '"Meter not moving?" troubleshooting popover for the wrong-mic case.',
          ],
        },
        {
          emoji: '🔥',
          title: 'Streak emojis on Home and Stats',
          details: [
            '🔥 5 days · 💎 30 days · 👑 100 days.',
          ],
        },
        {
          emoji: '🏷️',
          title: 'Renamed to Berimbau Pro (was Berimbau Trainer)',
          details: [
            'PWA install metadata updated.',
            'Fixed an iOS PWA bug where the homepage title rendered as a solid white block.',
          ],
        },
        {
          emoji: '⚠️',
          title: 'Calibrate-first warning',
          details: [
            'Tapping Start Practicing without a saved profile pops a modal that routes you straight to the calibration flow.',
          ],
        },
        {
          emoji: '🔁',
          title: 'Real-rhythm toggle in Settings (experimental)',
          details: [
            'Shifts the visual pattern one slot so the silence between cycles falls at 3 o\'clock.',
          ],
        },
        {
          emoji: '📲',
          title: 'PWA install button in Settings',
          details: [
            'Fixed a phantom-notes bug where strikes from previous sessions could appear in the practice circle.',
          ],
        },
      ],
    },
    pt: {
      title: 'Um app maior',
      linkLabel: 'Notas da versão v0.2 no GitHub',
      highlights: [
        {
          emoji: '⌨️',
          title: 'Teclas na tela quando o microfone não está disponível',
          details: [
            'Fallback de microfone para teclado em Praticar — se a permissão for negada ou o dispositivo não tiver microfone, o app mostra teclas na tela para você tocar.',
          ],
        },
        {
          emoji: '🎓',
          title: 'Take a class — a primeira aula guiada está no ar',
          details: [
            'Cantar a-e-i-o-u sobre São Bento Grande de Angola.',
            'Três partes: direta, inversa e combinada.',
            'Botão de repetir e auto-avanço entre as partes.',
          ],
        },
        {
          emoji: '🥁',
          title: 'Modo Play-along na barra de prática',
          details: [
            'Toca os sons do toque em cima da batida — algo para acompanhar em vez de praticar no silêncio.',
          ],
        },
        {
          emoji: '▶️',
          title: 'Prática começa automaticamente ao tocar',
          details: [
            'Um único botão Iniciar — sem a tela intermediária "Pronto?".',
          ],
        },
        {
          emoji: '🌊',
          title: 'Scatter da calibração refeito do zero',
          details: [
            'Eixos numerados.',
            'Mesmos glifos TCH × / DONG ○ / DING ● do resto do app.',
            'Tooltip ao passar o mouse com f0 e centroide.',
            'Clique em qualquer ponto para reproduzir a batida.',
            'Destaque cruzado com as miniaturas de forma de onda acima.',
          ],
        },
        {
          emoji: '🧭',
          title: 'Novos destinos no rodapé',
          details: [
            'Take a class · Ranking · Roadmap (timeline vertical com etiquetas de status) · Changelog · Sobre.',
          ],
        },
        {
          emoji: '🎤',
          title: 'Seletor de microfone em Configurações',
          details: [
            'Escolha qual microfone o app vai escutar.',
          ],
        },
        {
          emoji: '📈',
          title: 'Medidor de nível ao vivo durante a calibração',
          details: [
            'Popover de troubleshooting "o medidor não está mexendo?" para o caso de microfone errado.',
          ],
        },
        {
          emoji: '🔥',
          title: 'Emojis de streak na Home e em Stats',
          details: [
            '🔥 5 dias · 💎 30 dias · 👑 100 dias.',
          ],
        },
        {
          emoji: '🏷️',
          title: 'Renomeado para Berimbau Pro (era Berimbau Trainer)',
          details: [
            'Metadados de instalação do PWA atualizados.',
            'Corrigido um bug do PWA no iOS em que o título da home aparecia como um bloco branco sólido.',
          ],
        },
        {
          emoji: '⚠️',
          title: 'Aviso de calibrar primeiro',
          details: [
            'Tocar Iniciar sem um perfil salvo abre um modal que leva direto para o fluxo de calibração.',
          ],
        },
        {
          emoji: '🔁',
          title: 'Botão "Ritmo real" em Configurações (experimental)',
          details: [
            'Desloca o padrão visual em uma casa para que o silêncio entre os ciclos caia às 3 h.',
          ],
        },
        {
          emoji: '📲',
          title: 'Botão de instalar PWA em Configurações',
          details: [
            'Corrigido um bug de notas-fantasma em que batidas de sessões anteriores apareciam no círculo de prática.',
          ],
        },
      ],
    },
  },
  {
    version: 'v0.1',
    date: '2026-04-30',
    linkHref: 'https://github.com/jmoraispk/berimbau-trainer-web/releases/tag/v0.1',
    en: {
      title: 'Initial public release',
      linkLabel: 'v0.1 release notes on GitHub',
      highlights: [
        {
          emoji: '🪘',
          title: 'Five playable toques',
          details: [
            'São Bento Pequeno · Angola · São Bento Grande de Angola · Benguela · São Bento Grande (Regional).',
          ],
        },
        {
          emoji: '🎯',
          title: 'Practice mode',
          details: [
            'Linear and circular visualisations.',
            'Rolling 20-beat accuracy.',
            'Last-30-beats outcome breakdown.',
          ],
        },
        {
          emoji: '📐',
          title: 'Three-stage guided calibration',
          details: [
            'Waveform thumbnails.',
            'Click-to-play.',
            'Single-strike refractory.',
          ],
        },
        {
          emoji: '⏱️',
          title: 'Cycle-window strike acceptance',
          details: [
            'Strikes only count when they land in the cycle\'s PLAY phase, so stray sounds during the prep ramp are ignored.',
            'Pause / resume the cycle to listen back without new captures racing in.',
          ],
        },
        {
          emoji: '📚',
          title: '185-song lyrics catalog from lalaue.com',
          details: [
            'Style filter.',
            'Optional YouTube embed.',
          ],
        },
        {
          emoji: '📊',
          title: 'Stats dashboard',
          details: [
            'Lifetime counters.',
            '26-week activity heatmap.',
            'Per-toque aggregates and a full session log.',
          ],
        },
        {
          emoji: '🌐',
          title: 'Bilingual EN ⇄ PT',
        },
        {
          emoji: '💾',
          title: 'JSON backup / import, PWA install, offline-capable',
        },
      ],
    },
    pt: {
      title: 'Primeira versão pública',
      linkLabel: 'Notas da versão v0.1 no GitHub',
      highlights: [
        {
          emoji: '🪘',
          title: 'Cinco toques jogáveis',
          details: [
            'São Bento Pequeno · Angola · São Bento Grande de Angola · Benguela · São Bento Grande (Regional).',
          ],
        },
        {
          emoji: '🎯',
          title: 'Modo de prática',
          details: [
            'Visualizações linear e circular.',
            'Acurácia rolante de 20 batidas.',
            'Resumo das últimas 30 batidas.',
          ],
        },
        {
          emoji: '📐',
          title: 'Calibração guiada em três etapas',
          details: [
            'Miniaturas de forma de onda.',
            'Clique para reproduzir.',
            'Refractory de batida única.',
          ],
        },
        {
          emoji: '⏱️',
          title: 'Janela de aceitação no ciclo',
          details: [
            'Batidas só contam quando caem na fase PLAY do ciclo, então sons aleatórios durante a rampa de prep são ignorados.',
            'Pausar / retomar o ciclo para escutar sem novas capturas entrando.',
          ],
        },
        {
          emoji: '📚',
          title: 'Catálogo de letras com 185 músicas vindas do lalaue.com',
          details: [
            'Filtro por estilo.',
            'Embed opcional de YouTube.',
          ],
        },
        {
          emoji: '📊',
          title: 'Painel de estatísticas',
          details: [
            'Contadores ao longo da vida.',
            'Heatmap de atividade de 26 semanas.',
            'Agregados por toque e log completo de sessões.',
          ],
        },
        {
          emoji: '🌐',
          title: 'Bilíngue PT ⇄ EN',
        },
        {
          emoji: '💾',
          title: 'Backup / importação em JSON, instalação como PWA, funcionamento offline',
        },
      ],
    },
  },
  {
    version: 'v-1',
    date: 'archived',
    linkHref: 'https://github.com/jmoraispk/berimbau-trainer',
    en: {
      title: 'Python + Kivy desktop app',
      body: 'Predecessor to the current app — a desktop trainer written in Python with Kivy. Single-rhythm scoring, no calibration, no PWA, no web. The current versioning starts at v0.0.1, so the old app gets v-1 to mark it as "before zero" rather than implying a successor relationship.',
      linkLabel: 'jmoraispk/berimbau-trainer',
    },
    pt: {
      title: 'App desktop em Python + Kivy',
      body: 'Antecessor do app atual — um treinador desktop escrito em Python com Kivy. Pontuação de um ritmo só, sem calibração, sem PWA, sem web. A versão atual começa em v0.0.1, então o app antigo virou v-1 para marcar como "antes do zero" em vez de implicar uma sucessão direta.',
      linkLabel: 'jmoraispk/berimbau-trainer',
    },
  },
];

export function Changelog() {
  const { t, lang } = useI18n();
  return (
    <main className="min-h-full px-6 py-8 max-w-2xl mx-auto flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col">
          <h1 className="text-2xl font-semibold tracking-tight">{t('changelog.title')}</h1>
          <p className="text-text-dim text-sm">{t('changelog.subtitle')}</p>
        </div>
        <Link href="/" className="btn-ghost shrink-0">
          {t('common.back')}
        </Link>
      </header>

      <ol className="flex flex-col gap-3">
        {ENTRIES.map((entry) => {
          const block = entry[lang];
          return (
            <li key={entry.version} className="card flex flex-col gap-3 px-5 py-4">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-base font-semibold">
                  {entry.version}{' '}
                  <span className="text-text-dim font-normal">— {block.title}</span>
                </h2>
                <span className="text-[10px] font-mono uppercase tracking-wider text-text-dim shrink-0">
                  {entry.date}
                </span>
              </div>
              {block.body && (
                <p className="text-sm text-text-dim leading-relaxed">{block.body}</p>
              )}
              {block.highlights && (
                <ul className="flex flex-col gap-2.5">
                  {block.highlights.map((h, i) => (
                    <li key={i} className="flex flex-col gap-1">
                      <div className="flex gap-2 items-baseline">
                        {h.emoji && (
                          <span className="shrink-0 text-base leading-none">{h.emoji}</span>
                        )}
                        <span className="text-sm text-text leading-snug">{h.title}</span>
                      </div>
                      {h.details && h.details.length > 0 && (
                        <ul className="ml-7 flex flex-col gap-0.5 list-disc list-outside pl-4 marker:text-text-dim/50">
                          {h.details.map((d, j) => (
                            <li
                              key={j}
                              className="text-xs text-text-dim leading-relaxed"
                            >
                              {d}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {entry.linkHref && block.linkLabel && (
                <a
                  href={entry.linkHref}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-text-dim hover:text-text underline underline-offset-4 self-start"
                >
                  {block.linkLabel} ↗
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </main>
  );
}
