"use client";

import { useState } from "react";
import { CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { RANGE_PRESET_LABEL, rangeForPreset, type RangePresetKey } from "@/lib/reports-dates";
import type { ReportRange } from "@/types/reports";

const PRESETS: Exclude<RangePresetKey, "custom">[] = ["today", "yesterday", "last7", "thisMonth"];

/**
 * Selector de rango: presets calculados en el día comercial del restaurante
 * (ver lib/reports-dates.ts) + personalizado con dos inputs de fecha. El
 * preset personalizado espera un botón "Aplicar" — cambiar fecha por fecha
 * mientras se escribe dispararía un refetch por cada tecla.
 */
export function RangeSelector({
  timezone,
  businessDayCutoff,
  value,
  preset,
  onChange,
  disabled,
}: {
  timezone: string;
  businessDayCutoff: string;
  value: ReportRange;
  preset: RangePresetKey;
  onChange: (range: ReportRange, preset: RangePresetKey) => void;
  disabled?: boolean;
}) {
  const [customFrom, setCustomFrom] = useState(value.from);
  const [customTo, setCustomTo] = useState(value.to);

  function selectPreset(next: string) {
    if (!next) return;
    if (next === "custom") {
      onChange({ from: customFrom, to: customTo }, "custom");
      return;
    }
    const key = next as Exclude<RangePresetKey, "custom">;
    onChange(rangeForPreset(key, timezone, businessDayCutoff), key);
  }

  function applyCustom() {
    if (!customFrom || !customTo) return;
    onChange({ from: customFrom, to: customTo }, "custom");
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <ToggleGroup
        type="single"
        variant="outline"
        value={preset}
        onValueChange={selectPreset}
        disabled={disabled}
        className="flex-wrap justify-start"
      >
        {PRESETS.map((key) => (
          <ToggleGroupItem key={key} value={key} className="text-[13px]">
            {RANGE_PRESET_LABEL[key]}
          </ToggleGroupItem>
        ))}
        <ToggleGroupItem value="custom" className="text-[13px]">
          <CalendarRange className="h-4 w-4" />
          {RANGE_PRESET_LABEL.custom}
        </ToggleGroupItem>
      </ToggleGroup>

      {preset === "custom" && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={customFrom}
            max={customTo}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="h-9 w-[150px] text-[13px]"
            aria-label="Desde"
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="date"
            value={customTo}
            min={customFrom}
            onChange={(e) => setCustomTo(e.target.value)}
            className="h-9 w-[150px] text-[13px]"
            aria-label="Hasta"
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={applyCustom}
            disabled={disabled || !customFrom || !customTo}
          >
            Aplicar
          </Button>
        </div>
      )}
    </div>
  );
}
