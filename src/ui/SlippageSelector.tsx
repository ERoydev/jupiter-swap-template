import { useEffect, useRef, useState } from "react";

interface SlippageSelectorProps {
    value: number;
    onChange: (newBps: number) => void;
}

interface Preset {
    label: string;
    bps: number;
}

const PRESETS: readonly Preset[] = [
    { label: "0.1%", bps: 10 },
    { label: "0.5%", bps: 50 },
    { label: "1.0%", bps: 100 },
] as const;

const PRESET_BPS_SET = new Set(PRESETS.map((p) => p.bps));

// Accepts integers (`2`), leading-digit decimals (`2.5`), and leading-dot
// decimals (`.5`). Rejects trailing junk like `2.5abc` that parseFloat would
// otherwise silently truncate to a valid-looking number.
const DECIMAL_RE = /^(?:\d+(?:\.\d+)?|\.\d+)$/;

function isValidCustomInput(raw: string): boolean {
    const trimmed = raw.trim();
    if (!DECIMAL_RE.test(trimmed)) return false;
    const parsed = parseFloat(trimmed);
    return isValidCustomPercent(parsed);
}

function isValidCustomPercent(percent: number): boolean {
    return (
        Number.isFinite(percent) && percent >= 0.01 && percent <= 50
    );
}

export function SlippageSelector({ value, onChange }: SlippageSelectorProps) {
    const isCustomActive = !PRESET_BPS_SET.has(value);
    const [editingCustom, setEditingCustom] = useState(false);
    const [customDraft, setCustomDraft] = useState<string>(
        isCustomActive ? (value / 100).toString() : "",
    );
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (editingCustom && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editingCustom]);

    function selectPreset(bps: number) {
        setEditingCustom(false);
        setError(null);
        if (bps !== value) onChange(bps);
    }

    function startCustomEdit() {
        setCustomDraft(isCustomActive ? (value / 100).toString() : "");
        setError(null);
        setEditingCustom(true);
    }

    function commitCustom() {
        if (!isValidCustomInput(customDraft)) {
            // Invalid on commit — revert silently. The typing-time error
            // already fired via handleInputChange's aria-alert; re-raising it
            // here only to immediately clear it was a no-op that made role="alert"
            // never announce.
            setEditingCustom(false);
            setError(null);
            return;
        }
        const bps = Math.round(parseFloat(customDraft) * 100);
        setEditingCustom(false);
        setError(null);
        if (bps !== value) onChange(bps);
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter") {
            e.preventDefault();
            commitCustom();
        } else if (e.key === "Escape") {
            e.preventDefault();
            setEditingCustom(false);
            setError(null);
        }
    }

    function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
        const v = e.target.value;
        setCustomDraft(v);
        if (v === "" || isValidCustomInput(v)) {
            setError(null);
        } else {
            setError("Enter 0.01–50");
        }
    }

    const customLabel = isCustomActive ? `${(value / 100).toString()}%` : "Custom";
    const errorId = "slippage-custom-error";

    return (
        <div
            role="radiogroup"
            aria-label="Slippage tolerance"
            className="flex gap-2"
        >
            {PRESETS.map((p) => {
                const active = value === p.bps && !editingCustom;
                return (
                    <button
                        key={p.bps}
                        type="button"
                        aria-pressed={active}
                        aria-label={`${p.label} slippage tolerance`}
                        onClick={() => selectPreset(p.bps)}
                        className={
                            "flex-1 min-h-11 rounded-md border px-2 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                            (active
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-transparent text-foreground border-border hover:bg-accent")
                        }
                    >
                        {p.label}
                    </button>
                );
            })}

            {editingCustom ? (
                <input
                    ref={inputRef}
                    type="text"
                    inputMode="decimal"
                    value={customDraft}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    onBlur={commitCustom}
                    aria-label="Custom slippage tolerance (percent)"
                    aria-invalid={error !== null}
                    aria-describedby={error ? errorId : undefined}
                    className={
                        "flex-1 min-h-11 rounded-md border bg-transparent px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                        (error
                            ? "border-destructive text-destructive"
                            : "border-border text-foreground")
                    }
                />
            ) : (
                <button
                    type="button"
                    aria-pressed={isCustomActive}
                    aria-label="Custom slippage tolerance"
                    onClick={startCustomEdit}
                    className={
                        "flex-1 min-h-11 rounded-md border px-2 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                        (isCustomActive
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-transparent text-foreground border-border hover:bg-accent")
                    }
                >
                    {customLabel}
                </button>
            )}

            {error && (
                <span id={errorId} className="sr-only" role="alert">
                    {error}
                </span>
            )}
        </div>
    );
}
