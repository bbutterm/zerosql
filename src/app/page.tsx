import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-8">
      <div className="max-w-2xl text-center space-y-8">
        {/* Logo */}
        <div className="space-y-2">
          <h1 className="text-5xl font-bold tracking-tighter">
            <span className="text-primary">Zero</span>
            <span className="text-foreground">SQL</span>
          </h1>
          <div className="w-16 h-0.5 bg-primary mx-auto" />
        </div>

        {/* Tagline */}
        <p className="text-xl text-foreground/80 leading-relaxed">
          Детективная игра, где{" "}
          <span className="text-primary font-mono font-bold">SQL</span> — это
          геймплей
        </p>

        {/* Description */}
        <div className="space-y-3 text-muted-foreground text-sm leading-relaxed max-w-md mx-auto">
          <p>
            Город DataCity. Преступная группировка «BASE» контролирует порт,
            казино и подставные фирмы.
          </p>
          <p>
            Вы — детектив-аналитик полицейского управления. Ваше оружие —
            SQL-запросы к полицейской базе данных.
          </p>
          <p className="text-foreground/60 italic">
            Никаких кнопок. Никаких подсказок на блюдечке. Только вы, терминал
            и данные.
          </p>
        </div>

        {/* Start button */}
        <Link
          href="/game"
          className="inline-block px-8 py-3 bg-primary text-primary-foreground font-mono font-bold text-sm uppercase tracking-wider rounded hover:opacity-90 transition-opacity"
        >
          Начать расследование
        </Link>

        {/* Features */}
        <div className="grid grid-cols-3 gap-6 pt-8 border-t border-border">
          <div className="space-y-1">
            <p className="text-primary font-mono text-2xl font-bold">8</p>
            <p className="text-muted-foreground text-xs">таблиц данных</p>
          </div>
          <div className="space-y-1">
            <p className="text-primary font-mono text-2xl font-bold">15</p>
            <p className="text-muted-foreground text-xs">подозреваемых</p>
          </div>
          <div className="space-y-1">
            <p className="text-primary font-mono text-2xl font-bold">SQL</p>
            <p className="text-muted-foreground text-xs">ваше оружие</p>
          </div>
        </div>

        {/* Tech note */}
        <p className="text-muted-foreground/50 text-xs font-mono">
          SQLite работает прямо в браузере через WebAssembly. Серверов нет.
          Данные — ваши.
        </p>
      </div>
    </div>
  );
}
