import { readFileSync, writeFileSync } from "node:fs";
const p = "src/components/dashboard/DashboardContent.tsx";
let s = readFileSync(p, "utf8");

const ini = s.indexOf('      {/* ── This week, in one glance ────────────────────────────────── */}');
const fim = s.indexOf("      {lastSync && (");
if (ini < 0 || fim < 0) throw new Error("limites nao encontrados");

const L = [];
const w = (x) => L.push(x);

w('      {/*');
w('        Everything visible, ordered by weight.');
w('');
w('        Two passes went wrong here in opposite directions: the first hid the');
w('        whole screen behind accordions, the second replaced them with links');
w('        and left a home page made of buttons. Both misread the reference —');
w("        Whoop's overview is *dense*: a ring, bars, charts, all on screen at");
w('        once. What it does not do is give them equal weight.');
w('');
w('        So nothing is hidden. The hierarchy is size: the session of the day is');
w('        enormous, the week is a ring, the trends are charts, and the reference');
w('        material is small. Depth still exists — it is one tap into a dedicated');
w('        screen — but the athlete should never have to open anything to feel');
w('        that the app knows what it is talking about.');
w('      */}');
w('      <Reveal className="space-y-5">');
w('');
w('        <Section');
w('          title="Esta semana"');
w('          action={<Link href="/coach" className="text-xs text-surface-500 hover:text-surface-300">Plano</Link>}');
w('        >');
w('          <Card>');
w('            <div className="flex items-center gap-5">');
w('              <Ring');
w('                ratio={weekPlannedKm > 0 ? weekRunKm / weekPlannedKm : 0}');
w('                tone={toneForRatio(weekPlannedKm > 0 ? weekRunKm / weekPlannedKm : null)}');
w('                label="do plano"');
w('                size={104}');
w('              >');
w('                {weekPlannedKm > 0 ? Math.round((weekRunKm / weekPlannedKm) * 100) + "%" : "—"}');
w('              </Ring>');
w('');
w('              <div className="min-w-0 flex-1 space-y-3">');
w('                <div>');
w('                  <p className="text-3xl font-black text-surface-100 tabular-nums leading-none">');
w('                    <CountUp value={Math.round(weekRunKm * 10) / 10} decimals={1} />');
w('                    <span className="text-base text-surface-500 font-bold ml-1">km</span>');
w('                  </p>');
w('                  {weekPlannedKm > 0 && (');
w('                    <p className="text-xs text-surface-500 mt-1">de {weekPlannedKm} km planejados</p>');
w('                  )}');
w('                </div>');
w('                <div className="grid grid-cols-3 gap-2 text-center">');
w('                  <div>');
w('                    <p className="text-lg font-bold text-surface-100 tabular-nums leading-none">');
w('                      <CountUp value={weekRuns.length} />');
w('                    </p>');
w('                    <p className="text-[10px] uppercase tracking-wider text-surface-500 mt-1">corridas</p>');
w('                  </div>');
w('                  <div>');
w('                    <p className="text-lg font-bold text-surface-100 tabular-nums leading-none">');
w('                      <CountUp value={weekGymCount} />');
w('                    </p>');
w('                    <p className="text-[10px] uppercase tracking-wider text-surface-500 mt-1">muscu</p>');
w('                  </div>');
w('                  <button onClick={() => setCalorieDetail(true)} className="min-h-[44px]">');
w('                    <p className="text-lg font-bold text-surface-100 tabular-nums leading-none">');
w('                      <CountUp value={Math.round(weekCalories)} />');
w('                    </p>');
w('                    <p className="text-[10px] uppercase tracking-wider text-surface-500 mt-1">kcal</p>');
w('                  </button>');
w('                </div>');
w('              </div>');
w('            </div>');
w('          </Card>');
w('        </Section>');
w('');
w('        {weeklyPlan && <WeeklyPlanSummaryCard plan={weeklyPlan} />}');
w('');
w('        {/* Load — the second question, with the shape of its own trend. */}');
w('        {hojeCarga && (');
w('          <Section');
w('            title="Carga de treino"');
w('            action={<Link href="/analytics" className="text-xs text-surface-500 hover:text-surface-300">Detalhes</Link>}');
w('          >');
w('            <Card className="space-y-4">');
w('              <div className="flex items-center justify-between gap-4">');
w('                <MetricGrid cols={3}>');
w('                  <Metric label="Fitness" value={<CountUp value={Math.round(hojeCarga.ctl)} />} detail="CTL" />');
w('                  <Metric label="Fadiga" value={<CountUp value={Math.round(hojeCarga.atl)} />} detail="ATL" />');
w('                  <Metric');
w('                    label="Forma"');
w('                    value={(hojeCarga.tsb > 0 ? "+" : "") + Math.round(hojeCarga.tsb)}');
w('                    detail="TSB"');
w('                    tone={toneForTsb(hojeCarga.tsb)}');
w('                  />');
w('                </MetricGrid>');
w('                <Sparkline values={ctlTrend} tone="brand" width={80} height={32} />');
w('              </div>');
w('            </Card>');
w('          </Section>');
w('        )}');
w('');
w('        {/* The charts come back. A dashboard without them is a menu. */}');
w('        <Section');
w('          title="Volume"');
w('          subtitle="Últimas 12 semanas"');
w('          action={<Link href="/analytics" className="text-xs text-surface-500 hover:text-surface-300">Gráficos</Link>}');
w('        >');
w('          <Card>');
w('            <WeeklyVolumeChart data={weeklyData} />');
w('          </Card>');
w('        </Section>');
w('');
w('        <PersonalRecordsCard records={historicalRecords} />');
w('');
w('        <AchievementsCard achievements={achievements} />');
w('');
w('        {targetComparison && <TargetRaceCard comparison={targetComparison} />}');
w('');
w('        <Section');
w('          title="Atividade recente"');
w('          action={<Link href="/runs" className="text-xs text-surface-500 hover:text-surface-300">Ver todas</Link>}');
w('        >');
w('          <Card density="tight">');
w('            {feedItems.length === 0 ? (');
w('              <p className="text-sm text-surface-500 text-center py-4">Nada registrado ainda.</p>');
w('            ) : (');
w('              <RowGroup>');
w('                {feedItems.slice(0, 6).map((item) => (');
w('                  <Row');
w('                    key={item.kind + item.id}');
w('                    href={item.kind === "run" ? "/runs/" + item.id : "/calendar"}');
w('                    icon={<SportIcon type={item.sport_type} />}');
w('                    label={item.name}');
w('                    detail={new Date(item.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}');
w('                    value={item.metric}');
w('                  />');
w('                ))}');
w('              </RowGroup>');
w('            )}');
w('          </Card>');
w('        </Section>');
w('');
w('        <Section title="Seus números">');
w('          <div className="grid grid-cols-2 gap-3">');
w('            <StatCard label="Total de corridas" value={runs.length} icon={Target} />');
w('            <StatCard label="Distância total" value={formatDistanceKm(totalDistanceKm(runs))} icon={MapPin} />');
w('            <StatCard label="Sequência" value={computeRunStreak(runs) + " dias"} icon={Flame} />');
w('            <StatCard label="Dias treinados (30d)" value={last30.days} icon={CalendarCheck} />');
w('          </div>');
w('        </Section>');
w('');
w('        <NotificationNudge />');
w('      </Reveal>');
w('');

s = s.slice(0, ini) + L.join("\n") + s.slice(fim);

// Série de CTL para a sparkline.
s = s.replace(
  "  const weekPlannedKm = (weeklyPlan?.days ?? [])",
  [
    "  /* Last month of fitness, for the trend beside the numbers. */",
    "  const ctlTrend = Array.isArray(fitnessData)",
    "    ? fitnessData.slice(-30).map(d => d.ctl)",
    "    : [];",
    "",
    "  const weekPlannedKm = (weeklyPlan?.days ?? [])",
  ].join("\n"),
);

// Imports novos.
s = s.replace(
  'import { toneForTsb } from "@/components/ui/tone";',
  'import { toneForTsb, toneForRatio } from "@/components/ui/tone";\nimport { Ring, Sparkline } from "@/components/ui/Ring";',
);

writeFileSync(p, s, "utf8");
console.log("dashboard rico");
