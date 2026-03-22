import { useState, useEffect } from 'react';

interface CoordInputProps {
  value: number;
  onChange: (v: number) => void;
}

export default function CoordInput({ value, onChange }: CoordInputProps) {
  const [raw, setRaw] = useState(String(value));

  useEffect(() => {
    // Sync external value changes, but don't clobber active typing
    const parsed = parseFloat(raw);
    if (!isNaN(parsed) && parsed !== value) {
      setRaw(String(value));
    } else if (raw === '' || raw === '-') {
      // Keep showing what the user is typing
    } else if (isNaN(parsed)) {
      setRaw(String(value));
    }
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setRaw(v);

    if (v === '' || v === '-') return;

    const n = parseFloat(v);
    if (!isNaN(n)) {
      onChange(n);
    }
  }

  function handleBlur() {
    const n = parseFloat(raw);
    if (isNaN(n)) {
      setRaw(String(value));
    } else {
      onChange(n);
      setRaw(String(n));
    }
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={raw}
      onChange={handleChange}
      onBlur={handleBlur}
      className="coord-input"
    />
  );
}
