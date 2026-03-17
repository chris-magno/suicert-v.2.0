"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import { Card, Badge } from "@/components/ui";
import type { PublicProfile } from "@/types";

export default function PublicProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    params
      .then(({ id }) => fetch(`/api/profiles/${id}`))
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (!mounted) return;
        setProfile(data);
      })
      .catch(() => {
        if (mounted) setProfile(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [params]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <Navbar />
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "40px 24px" }}>
        <Link href="/profiles" style={{ textDecoration: "none", color: "var(--accent)", fontSize: 13, fontWeight: 600 }}>
          ← Back to public profiles
        </Link>

        {loading ? (
          <Card style={{ marginTop: 14, padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading profile...</Card>
        ) : !profile ? (
          <Card style={{ marginTop: 14, padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Profile not found.</Card>
        ) : (
          <Card style={{ marginTop: 14, padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
              <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800 }}>{profile.name}</h1>
              <Badge variant="success" dot>Verified Issuer</Badge>
            </div>
            <p style={{ margin: "0 0 10px", color: "var(--text-secondary)", fontSize: 14 }}>{profile.organization}</p>
            {profile.website && (
              <a href={profile.website} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: "var(--accent)", textDecoration: "none", display: "inline-block", marginBottom: 10 }}>
                {profile.website}
              </a>
            )}
            <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.7 }}>
              {profile.description}
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
