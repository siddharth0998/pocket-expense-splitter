"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const { theme, setTheme, systemTheme } = useTheme()
  const currentTheme = theme === "system" ? systemTheme : theme;

  return (
    <Button
      variant="ghost"
      size="icon"
      suppressHydrationWarning
      className="rounded-full w-10 h-10 border border-zinc-200 dark:border-zinc-800"
      onClick={() => setTheme(currentTheme === "dark" ? "light" : "dark")}
    >
      <Sun suppressHydrationWarning className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon suppressHydrationWarning className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
