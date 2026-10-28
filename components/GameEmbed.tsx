"use client";
import { useState } from "react";

/** Embeds the real 3D game replay page (provided under public/game by another agent); shows a notice if it is not there yet. */
export default function GameEmbed({ token, available }: { token: string; available: boolean }) {
  if (!available) {
    return (
      <p className="notice">
        The 3D game replay page is not available in this build yet, so the match cannot be rendered here.
        Use the 2D trace above, or open this link again once the game replay page ships.
      </p>
    );
  }
  return <iframe className="game-frame" src={`/game/replay.html?t=${token}`} title="Market Brawl 3D replay of this seed" allow="autoplay; gamepad" />;
}

export function CopyLink() {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" className="btn" onClick={async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        window.prompt("Copy this replay link", window.location.href);
      }
    }}>
      <span aria-live="polite">{copied ? "Copied" : "Copy replay link"}</span>
    </button>
  );
}
