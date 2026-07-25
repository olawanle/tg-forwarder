import React from "react";
import ReactDOM from "react-dom/client";
import {
  Activity,
  BarChart3,
  Bot,
  CalendarClock,
  CheckCircle2,
  Copy,
  Gauge,
  Megaphone,
  PauseCircle,
  PlayCircle,
  RadioTower,
  Search,
  Settings,
  Shield,
  Users,
  XCircle,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import "./styles.css";

const activity = [
  { day: "Mon", sent: 380, failed: 9 },
  { day: "Tue", sent: 520, failed: 16 },
  { day: "Wed", sent: 470, failed: 12 },
  { day: "Thu", sent: 690, failed: 24 },
  { day: "Fri", sent: 740, failed: 18 },
  { day: "Sat", sent: 430, failed: 7 },
  { day: "Sun", sent: 510, failed: 11 },
];

const campaigns = [
  { name: "June Partner Outreach", account: "@growth_ops", status: "Active", sent: 1284, health: "Clean" },
  { name: "Weekend Community Push", account: "@marketdesk", status: "Paused", sent: 612, health: "Cooldown" },
  { name: "Beta Invite Follow-up", account: "@launch_team", status: "Active", sent: 948, health: "Clean" },
  { name: "Document Drop", account: "@founderdesk", status: "Draft", sent: 0, health: "Ready" },
];

const accounts = [
  { label: "Growth Ops", groups: 382, status: "Active", limit: "31 / 40 hourly", risk: "Low" },
  { label: "Market Desk", groups: 156, status: "Rate limited", limit: "40 / 40 hourly", risk: "High" },
  { label: "Founder Desk", groups: 89, status: "Active", limit: "12 / 40 hourly", risk: "Low" },
];

function StatCard({ icon: Icon, label, value, tone }: any) {
  return (
    <section className="stat-card">
      <div className={`stat-icon ${tone}`}>
        <Icon size={18} />
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
    </section>
  );
}

function App() {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><Bot size={24} /> CampaignOS</div>
        <nav>
          {[
            [Gauge, "Overview"],
            [RadioTower, "Accounts"],
            [Users, "Groups"],
            [Megaphone, "Campaigns"],
            [CalendarClock, "Scheduler"],
            [BarChart3, "Statistics"],
            [Shield, "Admin"],
            [Settings, "Settings"],
          ].map(([Icon, label], index) => (
            <button className={index === 0 ? "active" : ""} key={String(label)}>
              <Icon size={17} /> {String(label)}
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>Telegram Campaign Manager</h1>
            <p>Monitor accounts, schedules, queues, and delivery health across tenant workspaces.</p>
          </div>
          <div className="search">
            <Search size={16} />
            <input placeholder="Search campaigns, groups, users" />
          </div>
        </header>

        <section className="stats-grid">
          <StatCard icon={RadioTower} label="Connected accounts" value="24" tone="blue" />
          <StatCard icon={Users} label="Imported groups" value="4,891" tone="green" />
          <StatCard icon={Megaphone} label="Active campaigns" value="17" tone="orange" />
          <StatCard icon={CheckCircle2} label="Successful deliveries" value="38,420" tone="green" />
          <StatCard icon={XCircle} label="Failed deliveries" value="312" tone="red" />
        </section>

        <section className="grid-two">
          <section className="panel activity-panel">
            <div className="panel-head">
              <div>
                <h2>Daily activity</h2>
                <p>Queued, delivered, and failed messages over the last 7 days.</p>
              </div>
              <button className="ghost"><Activity size={16} /> Live</button>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={activity}>
                <defs>
                  <linearGradient id="sent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1d7a6b" stopOpacity={0.32} />
                    <stop offset="95%" stopColor="#1d7a6b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#d9e2df" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip />
                <Area type="monotone" dataKey="sent" stroke="#1d7a6b" fill="url(#sent)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </section>

          <section className="panel health-panel">
            <div className="panel-head">
              <div>
                <h2>Account health</h2>
                <p>Rate-limit warnings and cooldown state.</p>
              </div>
            </div>
            {accounts.map((account) => (
              <article className="health-row" key={account.label}>
                <div>
                  <strong>{account.label}</strong>
                  <span>{account.groups} groups · {account.limit}</span>
                </div>
                <mark className={account.risk === "High" ? "danger" : "ok"}>{account.status}</mark>
              </article>
            ))}
          </section>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Campaign queue</h2>
              <p>Pause, resume, clone, and inspect tenant-owned campaigns.</p>
            </div>
            <button className="primary"><CalendarClock size={16} /> Schedule campaign</button>
          </div>
          <div className="table">
            <div className="table-row table-head">
              <span>Campaign</span><span>Account</span><span>Status</span><span>Sent</span><span>Health</span><span>Actions</span>
            </div>
            {campaigns.map((campaign) => (
              <div className="table-row" key={campaign.name}>
                <strong>{campaign.name}</strong>
                <span>{campaign.account}</span>
                <mark>{campaign.status}</mark>
                <span>{campaign.sent.toLocaleString()}</span>
                <span>{campaign.health}</span>
                <div className="actions">
                  <button aria-label="Resume"><PlayCircle size={17} /></button>
                  <button aria-label="Pause"><PauseCircle size={17} /></button>
                  <button aria-label="Clone"><Copy size={17} /></button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
