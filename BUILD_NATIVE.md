# Limiar — App nativo (Capacitor) com leitura do Garmin via Health Connect / Apple Health

Este guia transforma o Limiar (web) num app nativo Android/iOS que lê
**sono, HRV, FC de repouso, stress e body battery** que o **Garmin Connect**
grava no **Health Connect (Android)** / **Apple Health (iOS)**, e envia pro
Limiar (`POST /api/health/wellness`). A partir daí o **Limiar Score** roda
automático, sem check-in manual.

> ⚠️ Estas etapas precisam da SUA máquina: **Android Studio** (Android) e/ou
> **Xcode + Mac** (iOS), além das contas de loja (Google Play US$25 único,
> Apple Developer US$99/ano). O app web e a camada de ingestão já estão prontos
> e no ar — o que falta é compilar o invólucro nativo.

---

## Como funciona a arquitetura

- O app é **SSR (Next.js)**, então o Capacitor **não** faz static export: o
  `capacitor.config.ts` aponta `server.url` para `https://limiar-app.vercel.app`.
  O WebView carrega o app ao vivo (com sua sessão/cookies normais).
- A camada nativa lê o Health Connect/HealthKit e entrega os dados ao WebView,
  que já tem o componente **`NativeHealthSync`** (em `/health`) escutando:
  - evento `window.dispatchEvent(new CustomEvent("limiar:wellness", { detail: { days: [...] } }))`, **ou**
  - chamada direta `window.LimiarReceiveWellness({ days: [...] })`
- Esse componente faz `POST /api/health/wellness` com a sessão compartilhada.

### Contrato do payload (cada dia)
```jsonc
{
  "date": "2026-06-15",
  "sleep_seconds": 27000,   // sono total
  "sleep_score": 82,        // 0-100 (se disponível)
  "hrv_ms": 62.5,           // HRV noturno médio
  "hrv_status": "balanced", // balanced | unbalanced | low | poor
  "resting_hr": 48,
  "stress_avg": 28,         // 0-100
  "body_battery": 71        // 0-100 (manhã)
}
```
Campos ausentes são aceitos (o readiness renormaliza os pesos).

---

## 1. Pré-requisitos
- Node + repo clonado, `npm install`
- **Android:** Android Studio (com SDK + um device/emulador com **Health Connect** instalado)
- **iOS:** Mac com Xcode
- No celular: **Garmin Connect** sincronizando com Health Connect (Android) ou
  Apple Health (iOS). Em Health Connect, autorize o Garmin Connect a **gravar**
  sono/FC/HRV; no iOS, idem em Ajustes → Saúde → Acesso a Apps.

## 2. Adicionar as plataformas
```bash
npx cap add android
npx cap add ios        # só no Mac
npx cap sync
```

## 3. Instalar o plugin de saúde
**Android (Health Connect):**
```bash
npm install capacitor-health-connect
npx cap sync android
```
**iOS (HealthKit):**
```bash
npm install @perfood/capacitor-healthkit
npx cap sync ios
```
> Os nomes/APIs dos plugins da comunidade mudam; confira o README da versão
> instalada. A ideia é a mesma: pedir permissão e ler os registros do dia.

## 4. Permissões

**Android** — `android/app/src/main/AndroidManifest.xml`, dentro de `<application>` declare a intent de permissões do Health Connect e os tipos lidos (SleepSession, HeartRateVariabilityRmssd, RestingHeartRate, etc.). Siga o README do `capacitor-health-connect`.

**iOS** — em `ios/App/App/Info.plist` adicione `NSHealthShareUsageDescription` (texto explicando o uso) e habilite a capability **HealthKit** no target (Xcode → Signing & Capabilities).

## 5. Ler os dados e entregar ao WebView

Crie um pequeno trecho que roda no launch (ex.: um plugin custom ou no
`MainActivity`/`AppDelegate`, ou via JS injetado). Exemplo conceitual em JS
(dentro do WebView, após `deviceready`), usando o plugin Android:

```ts
import { HealthConnect } from "capacitor-health-connect";

async function syncWellness() {
  const granted = await HealthConnect.requestHealthPermissions({
    read: ["SleepSession", "HeartRateVariabilityRmssd", "RestingHeartRate", "HeartRate"],
  });
  if (!granted) return;

  const end = new Date();
  const start = new Date(end.getTime() - 7 * 86400000);
  const byDate: Record<string, any> = {};

  const sleep = await HealthConnect.readRecords({
    type: "SleepSession",
    timeRangeFilter: { type: "between", startTime: start, endTime: end },
  });
  for (const s of sleep.records) {
    const d = s.startTime.slice(0, 10);
    byDate[d] ??= { date: d };
    byDate[d].sleep_seconds = Math.round((new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / 1000);
  }
  // …idem para HRV (hrv_ms) e RestingHeartRate (resting_hr)…

  (window as any).LimiarReceiveWellness?.({ days: Object.values(byDate) });
}
```

> body_battery e stress não têm tipo nativo no Health Connect padrão — se o
> Garmin não os expuser, o readiness usa sono + HRV + FC repouso + carga, que já
> bastam. (No futuro, dá pra puxar body battery/stress via Health API oficial.)

## 6. Rodar e testar
```bash
npx cap run android     # device/emulador com Health Connect
npx cap run ios         # no Mac
```
Abra a aba **Saúde** no app → conceda as permissões → o card de prontidão deve
passar a mostrar o selo **"dados do relógio"**. Confirme no Supabase que a tabela
`wellness_data` recebeu a linha do dia.

## 7. Publicar
- **Android:** Android Studio → Build → Generate Signed Bundle (.aab) → Google Play Console.
- **iOS:** Xcode → Archive → Distribute → App Store Connect.
- Sempre que mudar a config: `npx cap sync`.

---

## Checklist
- [ ] `npx cap add android` / `ios`
- [ ] plugin de saúde instalado e `cap sync`
- [ ] permissões no Manifest / Info.plist
- [ ] bridge chamando `window.LimiarReceiveWellness({ days })`
- [ ] testado em device com Garmin Connect → Health Connect/Apple Health
- [ ] `wellness_data` populando + selo "dados do relógio" aparecendo
- [ ] assinado e publicado nas lojas
