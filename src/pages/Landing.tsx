import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import {
  BarChart3,
  Activity,
  Car,
  Cpu,
  Globe,
  Zap,
  ShieldCheck,
  ArrowRight,
  BrainCircuit,
  Bell,
  AlertTriangle,
  Clock,
  Navigation,
  ShieldAlert
} from "lucide-react";

const LandingPage = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-slate-50 selection:bg-indigo-100 font-sans">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-xl text-slate-900 tracking-tight">
            <div className="bg-indigo-600 p-1.5 rounded-lg shadow-lg shadow-indigo-200">
              <Activity size={20} className="text-white" />
            </div>
            Yatayat
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-600">
            <a href="#problems" className="hover:text-indigo-600 transition-colors">{t("landing.nav.challenge")}</a>
            <a href="#solutions" className="hover:text-indigo-600 transition-colors">{t("landing.nav.solutions")}</a>
            <LanguageSwitcher />
            <button
              onClick={() => navigate('/login')}
              className="bg-slate-900 text-white px-6 py-2.5 rounded-full hover:bg-indigo-600 transition-all shadow-md shadow-slate-200"
            >
              {t("landing.nav.login")}
            </button>
          </div>
        </div>
      </nav>

      <main className="pt-32 pb-20">
        <div className="container mx-auto px-6">
          {/* Hero Section */}
          <div className="flex flex-col items-center text-center max-w-4xl mx-auto mb-32 animate-in fade-in slide-in-from-bottom-8 duration-1000">
            <h1 className="text-5xl md:text-7xl font-black text-slate-900 mb-8 leading-[1.05] tracking-tight">
              {t("landing.hero.title")} <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-500">{t("landing.hero.titleAccent")}</span>
            </h1>

            <p className="text-xl text-slate-600 mb-12 max-w-2xl leading-relaxed">
              {t("landing.hero.description")}
            </p>

            <div className="flex flex-wrap justify-center gap-4">
              <button
                onClick={() => navigate('/login')}
                className="group flex items-center justify-center gap-2 px-10 py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200"
              >
                {t("landing.hero.launch")} <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>

          {/* Problem Section */}
          <section id="problems" className="mb-32">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-black text-slate-900 mb-4">{t("landing.challenge.title")}</h2>
              <p className="text-slate-600 max-w-2xl mx-auto">{t("landing.challenge.subtitle")}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <ProblemBox
                icon={<Clock className="text-red-500" />}
                title={t("landing.challenge.problems.fixed.title")}
                desc={t("landing.challenge.problems.fixed.desc")}
              />
              <ProblemBox
                icon={<AlertTriangle className="text-amber-500" />}
                title={t("landing.challenge.problems.unfair.title")}
                desc={t("landing.challenge.problems.unfair.desc")}
              />
              <ProblemBox
                icon={<ShieldAlert className="text-rose-600" />}
                title={t("landing.challenge.problems.gridlock.title")}
                desc={t("landing.challenge.problems.gridlock.desc")}
              />
              <ProblemBox
                icon={<Navigation className="text-orange-500" />}
                title={t("landing.challenge.problems.coordination.title")}
                desc={t("landing.challenge.problems.coordination.desc")}
              />
            </div>
          </section>

          {/* Feature/Solution Bento Grid */}
          <section id="solutions">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-black text-slate-900 mb-4">{t("landing.solutions.title")}</h2>
              <p className="text-slate-600 max-w-2xl mx-auto">{t("landing.solutions.subtitle")}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2">
                <FeatureCard
                  icon={<BrainCircuit className="text-indigo-600" />}
                  title={t("landing.solutions.features.dynamic.title")}
                  desc={t("landing.solutions.features.dynamic.desc")}
                  tag={t("landing.solutions.features.dynamic.tag")}
                />
              </div>
              <FeatureCard
                icon={<Zap className="text-amber-500" />}
                title={t("landing.solutions.features.predictive.title")}
                desc={t("landing.solutions.features.predictive.desc")}
                tag={t("landing.solutions.features.predictive.tag")}
              />
              <FeatureCard
                icon={<Bell className="text-red-500" />}
                title={t("landing.solutions.features.corridors.title")}
                desc={t("landing.solutions.features.corridors.desc")}
                tag={t("landing.solutions.features.corridors.tag")}
              />
              <div className="md:col-span-2">
                <FeatureCard
                  icon={<ShieldCheck className="text-emerald-600" />}
                  title={t("landing.solutions.features.enforcement.title")}
                  desc={t("landing.solutions.features.enforcement.desc")}
                  tag={t("landing.solutions.features.enforcement.tag")}
                />
              </div>
            </div>
          </section>
        </div>
      </main>

      <footer className="py-12 border-t border-slate-200 text-center">
        <p className="text-slate-500 text-sm font-medium">
          {t("landing.footer")}
        </p>
      </footer>
    </div>
  );
};

const ProblemBox = ({ icon, title, desc }) => (
  <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
    <div className="mb-4">{icon}</div>
    <h4 className="font-bold text-slate-900 mb-2">{title}</h4>
    <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
  </div>
);

const FeatureCard = ({ icon, title, desc, tag }) => (
  <div className="group bg-white p-8 rounded-3xl border border-slate-200 hover:border-indigo-200 hover:shadow-2xl hover:shadow-indigo-100/50 transition-all duration-500 h-full">
    <div className="flex justify-between items-start mb-8">
      <div className="bg-slate-50 w-14 h-14 rounded-2xl flex items-center justify-center group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors shadow-inner">
        {icon}
      </div>
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-slate-100 px-2 py-1 rounded">
        {tag}
      </span>
    </div>
    <h3 className="text-2xl font-bold text-slate-900 mb-4">{title}</h3>
    <p className="text-slate-600 leading-relaxed text-sm md:text-base">{desc}</p>
  </div>
);

export default LandingPage;