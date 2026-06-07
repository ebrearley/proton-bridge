"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ThemePreference = "system" | "light" | "dark";

const storageKey = "proton-bridge-theme";
const themeChangeEvent = "proton-bridge-theme-change";

const options: Array<{
  value: ThemePreference;
  label: string;
  icon: typeof Monitor;
}> = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

function systemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(preference: ThemePreference) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");

  if (preference === "system") {
    const resolvedTheme = systemTheme();
    root.classList.add(resolvedTheme);
    root.style.colorScheme = resolvedTheme;
    return;
  }

  root.classList.add(preference);
  root.style.colorScheme = preference;
}

function storedPreference(): ThemePreference {
  const stored = localStorage.getItem(storageKey);
  return stored === "light" || stored === "dark" ? stored : "system";
}

function readPreference(): ThemePreference {
  if (typeof window === "undefined") {
    return "system";
  }

  return storedPreference();
}

function subscribeToPreference(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(themeChangeEvent, callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(themeChangeEvent, callback);
  };
}

export function ThemeToggle() {
  const preference = useSyncExternalStore<ThemePreference>(
    subscribeToPreference,
    readPreference,
    () => "system",
  );

  useEffect(() => applyTheme(preference), [preference]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => {
      if (storedPreference() === "system") {
        applyTheme("system");
      }
    };

    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  function chooseTheme(nextPreference: ThemePreference) {
    if (nextPreference === "system") {
      localStorage.removeItem(storageKey);
    } else {
      localStorage.setItem(storageKey, nextPreference);
    }

    window.dispatchEvent(new Event(themeChangeEvent));
    applyTheme(nextPreference);
  }

  return (
    <div
      data-theme-toggle
      className="flex rounded-lg border border-border bg-background p-0.5"
    >
      {options.map((option) => {
        const Icon = option.icon;
        const selected = preference === option.value;

        return (
          <Button
            key={option.value}
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={option.label}
            aria-pressed={selected}
            title={option.label}
            className={cn(
              "rounded-md text-muted-foreground",
              selected && "bg-muted text-foreground",
            )}
            onClick={() => chooseTheme(option.value)}
          >
            <Icon aria-hidden="true" />
          </Button>
        );
      })}
    </div>
  );
}
