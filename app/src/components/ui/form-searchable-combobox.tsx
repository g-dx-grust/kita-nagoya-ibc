"use client";

import { useState } from "react";
import SearchableCombobox, { type SearchableComboboxOption } from "./searchable-combobox";

export default function FormSearchableCombobox({
  name,
  initialValue,
  options,
  emptyOptionLabel,
  placeholder,
  ariaLabel,
}: {
  name: string;
  initialValue: string;
  options: SearchableComboboxOption[];
  emptyOptionLabel?: string;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [value, setValue] = useState(initialValue);

  return (
    <SearchableCombobox
      name={name}
      value={value}
      options={options}
      emptyOptionLabel={emptyOptionLabel}
      placeholder={placeholder}
      ariaLabel={ariaLabel}
      onChange={setValue}
    />
  );
}
