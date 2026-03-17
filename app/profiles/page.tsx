"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import { Card, Badge } from "@/components/ui";
import type { PublicProfile } from "@/types";

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<PublicProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/profiles")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setProfiles(Array.isArray(data) ? data : []))
      .catch(() => setProfiles([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <Navbar />
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "40px 24px" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 800, marginBottom: 8 }}>Public Profiles</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 24 }}>
          Browse verified issuer profiles. Google users can view profiles and upgrade identity to zkLogin + wallet bind for issuer privileges.
        </p>

        {loading ? (
          <Card style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading profiles...</Card>
        ) : profiles.length === 0 ? (
          <Card style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>No public profiles available yet.</Card>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
            {profiles.map((profile) => (
              <Link key={profile.id} href={`/profiles/${profile.id}`} style={{ textDecoration: "none" }}>
                <Card hover style={{ padding: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <p style={{ margin: 0, fontFamily: "var(--font-display)", color: "var(--text-primary)", fontSize: 16, fontWeight: 700 }}>{profile.name}</p>
                    <Badge variant="success" dot>Verified</Badge>
                  </div>
                  <p style={{ margin: "0 0 6px", color: "var(--text-secondary)", fontSize: 13 }}>{profile.organization}</p>
                  <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 12, lineHeight: 1.5 }}>
                    {profile.description.slice(0, 120)}{profile.description.length > 120 ? "..." : ""}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
