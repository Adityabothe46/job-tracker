"use client";

import Link from "next/link";
import { useState } from "react";
import { Tabs } from "@/components/ui/Tabs";
import { Toast, useToast } from "@/components/ui/Toast";
import { ProfileTab } from "@/components/settings/ProfileTab";
import { DiscoveryTab } from "@/components/discovery/DiscoveryTab";

export default function SettingsPage() {
  const [tab, setTab] = useState<"profile" | "discovery">("profile");
  const { toast, showToast } = useToast();

  return (
    <div className="min-h-screen">
      <header className="glass sticky top-0 z-10 border-b border-line px-6 py-4">
        <div className="mx-auto flex max-w-[900px] items-center justify-between">
          <h1 className="font-display text-lg font-bold tracking-tight text-gradient">Settings</h1>
          <Link
            href="/"
            className="text-sm font-medium text-ink-muted transition-colors hover:text-ink"
          >
            ← Back to board
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[900px] px-6 py-8">
        <div className="mb-5">
          <Tabs
            tabs={[
              { key: "profile", label: "Profile" },
              { key: "discovery", label: "Discovery" },
            ]}
            active={tab}
            onChange={(key) => setTab(key as "profile" | "discovery")}
          />
        </div>

        {tab === "profile" ? (
          <ProfileTab onToast={showToast} />
        ) : (
          <DiscoveryTab onToast={showToast} />
        )}
      </main>

      <Toast toast={toast} />
    </div>
  );
}
