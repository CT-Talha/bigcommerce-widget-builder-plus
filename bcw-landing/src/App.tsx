import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M3 8l3.5 3.5L13 4.5" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const features = [
  {
    icon: "⚡",
    title: "Live Preview",
    desc: "See your widget render in real-time as you edit. No more push-to-see cycles eating your day.",
  },
  {
    icon: "🏪",
    title: "Multi-Store Dashboard",
    desc: "Manage widgets across all your client stores from one place. Switch stores in seconds.",
  },
  {
    icon: "📦",
    title: "Widget Library",
    desc: "Pre-built, tested widgets ready to deploy. FAQ, hero, testimonials, tabs and more.",
  },
  {
    icon: "🚀",
    title: "One-Click Deploy",
    desc: "Push any widget to any connected store instantly. POST or PUT handled automatically.",
  },
  {
    icon: "🖥️",
    title: "CLI + Web UI",
    desc: "Use the terminal if you prefer, or the browser. Both are fully supported.",
  },
  {
    icon: "🔒",
    title: "Credentials Stay Safe",
    desc: "Store credentials are encrypted server-side. No API keys floating around in .env files.",
  },
];

const painPoints = [
  {
    before: "Manually calling BC API every time you edit a widget",
    after: "Edit locally, preview live, push with one command",
  },
  {
    before: "No way to preview widgets without pushing to a live store",
    after: "Full local preview server with Page Builder-style controls",
  },
  {
    before: "Switching between 10 client stores means juggling API keys",
    after: "All stores connected in one dashboard",
  },
  {
    before: "Starting every widget from scratch",
    after: "Scaffold new widgets instantly or pick from the library",
  },
];

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "",
    desc: "Try it on your own projects",
    features: [
      "1 connected store",
      "3 widgets",
      "CLI access",
      "Live preview",
      "Community support",
    ],
    cta: "Get Started Free",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$29",
    period: "/mo",
    desc: "For freelancers managing client stores",
    features: [
      "5 connected stores",
      "Full widget library",
      "CLI + Web UI",
      "Live preview",
      "One-click deploy",
      "Email support",
    ],
    cta: "Join Waitlist",
    highlight: true,
  },
  {
    name: "Agency",
    price: "$79",
    period: "/mo",
    desc: "For teams running multiple BC clients",
    features: [
      "Unlimited stores",
      "Full widget library",
      "Team seats",
      "CLI + Web UI",
      "Priority support",
      "White-label exports",
    ],
    cta: "Join Waitlist",
    highlight: false,
  },
];

const faqs = [
  {
    q: "Do I need to be a BigCommerce partner to use this?",
    a: "No. You just need a BigCommerce store with API access. Any BC developer with an API key can use BCW.",
  },
  {
    q: "Does this work with the BC Page Builder?",
    a: "Yes. Widgets you build and push with BCW appear directly in BigCommerce Page Builder, fully editable by store owners.",
  },
  {
    q: "Is the CLI still available on the paid plans?",
    a: "Yes. CLI access is available on all plans including Free. Pro and Agency plans also include the full Web UI dashboard.",
  },
  {
    q: "Can I use my own custom widget code?",
    a: "Absolutely. BCW doesn't lock you into templates. Write your own HTML, schema.json, and config — BCW handles the rest.",
  },
  {
    q: "What happens to my widgets if I cancel?",
    a: "Your widgets stay on your BigCommerce store. BCW doesn't host your widgets — it just helps you manage them. You'll always have full access to your files.",
  },
  {
    q: "When is this launching?",
    a: "We're targeting a public launch in Q3 2026. Join the waitlist to get early access and a launch discount.",
  },
];

export default function App() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-slate-100 font-sans">
      {/* Nav */}
      <nav className="border-b border-slate-800 px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <span className="text-blue-400 font-bold text-xl tracking-tight">BCW</span>
          <span className="text-slate-500 text-sm hidden sm:block">/ Widget Builder Plus</span>
        </div>
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="border-blue-500/40 text-blue-400 text-xs">
            Early Access
          </Badge>
          <a href="#pricing" className="text-slate-400 hover:text-white text-sm transition-colors">Pricing</a>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-24 pb-20 text-center">
        <Badge className="mb-6 bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/10">
          Built for BigCommerce Agencies
        </Badge>
        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight leading-tight mb-6 text-white">
          The widget dev toolkit{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-violet-400">
            BC forgot to build
          </span>
        </h1>
        <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          Create, preview, and deploy BigCommerce Page Builder widgets across all your client stores — without touching the API manually.
        </p>

        {!submitted ? (
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <Input
              type="email"
              placeholder="your@agency.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500 h-11 flex-1"
            />
            <Button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white h-11 px-6 font-medium">
              Join Waitlist
            </Button>
          </form>
        ) : (
          <div className="flex items-center justify-center gap-2 text-green-400 font-medium">
            <CheckIcon />
            You're on the list — we'll be in touch.
          </div>
        )}
        <p className="text-slate-600 text-xs mt-4">No spam. Early access + launch discount for waitlist members.</p>

        {/* Terminal preview */}
        <div className="mt-16 rounded-lg border border-slate-800 bg-slate-900/60 text-left overflow-hidden shadow-2xl">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800 bg-slate-900">
            <div className="w-3 h-3 rounded-full bg-red-500/60"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500/60"></div>
            <div className="w-3 h-3 rounded-full bg-green-500/60"></div>
            <span className="text-slate-500 text-xs ml-2">terminal</span>
          </div>
          <div className="p-5 font-mono text-sm leading-7">
            <div><span className="text-slate-500">$</span> <span className="text-blue-400">npx bcw</span> <span className="text-white">create hero-banner</span></div>
            <div className="text-green-400">✓ Scaffolded widgets/hero-banner/</div>
            <div className="mt-2"><span className="text-slate-500">$</span> <span className="text-blue-400">npx bcw</span> <span className="text-white">dev widgets/hero-banner</span></div>
            <div className="text-slate-400">  Preview running at <span className="text-blue-400 underline">localhost:4041</span></div>
            <div className="text-slate-400">  Watching for changes...</div>
            <div className="mt-2"><span className="text-slate-500">$</span> <span className="text-blue-400">npx bcw</span> <span className="text-white">push widgets/hero-banner</span></div>
            <div className="text-green-400">✓ Widget pushed to store — UUID saved to widget.yml</div>
          </div>
        </div>
      </section>

      {/* Pain points */}
      <section className="border-t border-slate-800 py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-3 text-white">The old way is painful</h2>
          <p className="text-slate-400 text-center mb-12">Here's what changes when you use BCW</p>
          <div className="grid gap-4">
            {painPoints.map((p, i) => (
              <div key={i} className="grid sm:grid-cols-2 gap-4">
                <div className="bg-red-950/20 border border-red-900/30 rounded-lg p-4 flex items-start gap-3">
                  <span className="text-red-400 mt-0.5 text-lg">✗</span>
                  <p className="text-slate-400 text-sm">{p.before}</p>
                </div>
                <div className="bg-green-950/20 border border-green-900/30 rounded-lg p-4 flex items-start gap-3">
                  <span className="text-green-400 mt-0.5 text-lg">✓</span>
                  <p className="text-slate-300 text-sm">{p.after}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-slate-800 py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-3 text-white">Everything you need</h2>
          <p className="text-slate-400 text-center mb-12">Built for the way agencies actually work</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f, i) => (
              <div key={i} className="bg-slate-900/60 border border-slate-800 rounded-lg p-5 hover:border-slate-700 transition-colors">
                <div className="text-2xl mb-3">{f.icon}</div>
                <h3 className="font-semibold text-white mb-2">{f.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-slate-800 py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-3 text-white">Simple pricing</h2>
          <p className="text-slate-400 text-center mb-12">Start free, scale when you need to</p>
          <div className="grid sm:grid-cols-3 gap-5">
            {plans.map((plan, i) => (
              <div
                key={i}
                className={`rounded-lg p-6 border flex flex-col ${
                  plan.highlight
                    ? "border-blue-500/50 bg-blue-950/20 shadow-lg shadow-blue-950/30"
                    : "border-slate-800 bg-slate-900/40"
                }`}
              >
                {plan.highlight && (
                  <Badge className="self-start mb-4 bg-blue-600 text-white text-xs">Most Popular</Badge>
                )}
                <h3 className="font-bold text-white text-lg">{plan.name}</h3>
                <div className="mt-2 mb-1">
                  <span className="text-3xl font-bold text-white">{plan.price}</span>
                  <span className="text-slate-500 text-sm">{plan.period}</span>
                </div>
                <p className="text-slate-500 text-xs mb-5">{plan.desc}</p>
                <ul className="space-y-2.5 mb-6 flex-1">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-center gap-2 text-sm text-slate-300">
                      <CheckIcon />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  className={`w-full ${
                    plan.highlight
                      ? "bg-blue-600 hover:bg-blue-500 text-white"
                      : "bg-slate-800 hover:bg-slate-700 text-white"
                  }`}
                  onClick={() => document.querySelector("input")?.focus()}
                >
                  {plan.cta}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-slate-800 py-20 px-6">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-12 text-white">Frequently asked questions</h2>
          <Accordion type="single" collapsible className="space-y-2">
            {faqs.map((faq, i) => (
              <AccordionItem
                key={i}
                value={`faq-${i}`}
                className="border border-slate-800 rounded-lg px-5 bg-slate-900/40"
              >
                <AccordionTrigger className="text-white text-sm font-medium text-left hover:no-underline py-4">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-slate-400 text-sm leading-relaxed pb-4">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-slate-800 py-20 px-6 text-center">
        <div className="max-w-xl mx-auto">
          <h2 className="text-2xl font-bold text-white mb-4">Ready to stop doing this the hard way?</h2>
          <p className="text-slate-400 mb-8">Join the waitlist. Early members get a discount at launch.</p>
          {!submitted ? (
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <Input
                type="email"
                placeholder="your@agency.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500 h-11 flex-1"
              />
              <Button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white h-11 px-6 font-medium">
                Join Waitlist
              </Button>
            </form>
          ) : (
            <div className="flex items-center justify-center gap-2 text-green-400 font-medium">
              <CheckIcon />
              You're on the list — we'll be in touch.
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-blue-400 font-bold">BCW</span>
            <span className="text-slate-600 text-sm">BigCommerce Widget Builder Plus</span>
          </div>
          <p className="text-slate-600 text-xs">© 2026 BCW. Built for BigCommerce developers.</p>
        </div>
      </footer>
    </div>
  );
}
