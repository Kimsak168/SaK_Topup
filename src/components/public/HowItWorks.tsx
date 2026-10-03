import { UserCheck, Zap, ShieldCheck, Clock, Award } from "lucide-react";

export function HowItWorks() {
  const steps = [
    {
      num: "01",
      title: "Select Game & Amount",
      desc: "Browse our catalogue of top titles including Free Fire, PUBG Mobile, MLBB, and pick your preferred Diamonds or UC pack.",
      icon: Award,
      color: "from-primary to-brand-purple",
    },
    {
      num: "02",
      title: "Input Player ID",
      desc: "Provide your in-game User ID and Server/Zone ID if required. Our live verification tool checks your nickname before charging.",
      icon: UserCheck,
      color: "from-brand-purple to-brand-blue",
    },
    {
      num: "03",
      title: "Instant In-Game Delivery",
      desc: "Complete payment via KHQR, ABA, or e-wallet. Our automated supplier APIs credit your game balance directly within 60 seconds.",
      icon: Zap,
      color: "from-success to-brand-blue",
    },
  ];

  const features = [
    {
      title: "Direct Supplier APIs",
      desc: "Connected directly with Vizo and G2Bulk for authorized, wholesale rate fulfillment without intermediaries.",
      icon: Zap,
    },
    {
      title: "Zero Account Risk",
      desc: "We never ask for your game password or login credentials. Only public Player ID is required.",
      icon: ShieldCheck,
    },
    {
      title: "24/7 Fully Automated",
      desc: "Our servers process orders automatically 24 hours a day, 7 days a week, including holidays.",
      icon: Clock,
    },
  ];

  return (
    <div className="space-y-20 py-8">
      {/* How it Works Section */}
      <section id="how-it-works" className="w-full scroll-mt-24">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-xs font-bold uppercase tracking-wider text-primary">
            Simple 3-Step Process
          </span>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-foreground tracking-tight mt-1">
            How Top-Up Works
          </h2>
          <p className="text-sm text-muted-foreground mt-2">
            Recharge your favorite games with zero hassle and lightning-fast speed.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            return (
              <div
                key={step.num}
                className="relative rounded-2xl p-6 sm:p-8 bg-card backdrop-blur-sm border border-border shadow-soft hover:shadow-soft hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr ${step.color} shadow-soft text-primary-foreground`}
                    >
                      <Icon className="h-6 w-6" />
                    </div>
                    <span className="text-4xl font-black text-foreground select-none">
                      {step.num}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-foreground mb-2">{step.title}</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    {step.desc}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-border flex items-center gap-2 text-xs font-semibold text-primary">
                  <span>Step {idx + 1} of 3</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Trust & Guarantees */}
      <section id="features" className="w-full rounded-3xl border border-pink-200/40 bg-gradient-to-b from-white to-pink-50/30 p-8 sm:p-12 relative overflow-hidden shadow-soft">
        <div className="absolute top-0 right-0 w-80 h-80 bg-purple-200/15 rounded-full blur-[100px] pointer-events-none" />

        <div className="max-w-2xl mx-auto text-center space-y-3 mb-10">
          <span className="text-xs font-bold uppercase tracking-wider text-brand-purple">
            Enterprise Grade Security
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground">
            Why Southeast Asia Chooses SakSuuu
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Backed by official wholesaler credentials, direct API infrastructure, and real customer support.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((feat) => {
            const Icon = feat.icon;
            return (
              <div
                key={feat.title}
                className="rounded-2xl bg-card backdrop-blur-sm border border-border p-6 hover:border-pink-300/60 hover:shadow-md transition-all duration-300"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-primary border border-pink-200/60 mb-4">
                  <Icon className="h-5 w-5" />
                </div>
                <h4 className="text-base font-bold text-foreground mb-1.5">{feat.title}</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">{feat.desc}</p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
