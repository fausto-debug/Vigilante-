// =============================================================
// icons.js
// Local: raiz do projeto (mesma pasta do index.html)
//
// Responsabilidade: um único conjunto de ícones SVG (linha fina,
// minimalista) usado em todo o painel, no lugar de emojis. Todos
// usam stroke="currentColor", então herdam a cor do elemento pai
// automaticamente (funcionam com qualquer cor de destaque).
// =============================================================

const PATHS = {
  // navegação
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1V9.5"/>',
  wallet: '<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h13A1.5 1.5 0 0 1 19 7.5V9H4.5A1.5 1.5 0 0 1 3 7.5Z"/><path d="M3 9v9a1.5 1.5 0 0 0 1.5 1.5h15A1.5 1.5 0 0 0 21 18V10.5A1.5 1.5 0 0 0 19.5 9H4.5A1.5 1.5 0 0 1 3 7.5"/><circle cx="16.5" cy="14" r="1.25"/>',
  vault: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.8" fill="currentColor" stroke="none"/><path d="M7 4v2M17 4v2M7 18v2M17 18v2"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 9.5h17"/><path d="M8 3v3.2M16 3v3.2"/>',
  checkCircle: '<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.2 2.3 2.3 4.7-4.9"/>',
  fileText: '<path d="M7 3.5h7L19 8.5V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"/><path d="M14 3.5V8a1 1 0 0 0 1 1h4.4"/><path d="M9 13h6M9 16.2h6"/>',
  dumbbell: '<path d="M5 9v6M3.3 10.5v3M19 9v6M20.7 10.5v3"/><path d="M8 8.5v7M16 8.5v7"/><path d="M8 12h8"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a1.7 1.7 0 0 0 .35 1.9l.06.06a2.1 2.1 0 1 1-2.95 2.95l-.06-.06a1.7 1.7 0 0 0-1.9-.35 1.7 1.7 0 0 0-1 1.55V19.7a2.1 2.1 0 1 1-4.2 0v-.1a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.9.35l-.06.06a2.1 2.1 0 1 1-2.95-2.95l.06-.06a1.7 1.7 0 0 0 .35-1.9 1.7 1.7 0 0 0-1.55-1H4.3a2.1 2.1 0 1 1 0-4.2h.1a1.7 1.7 0 0 0 1.55-1.1 1.7 1.7 0 0 0-.35-1.9l-.06-.06a2.1 2.1 0 1 1 2.95-2.95l.06.06a1.7 1.7 0 0 0 1.9.35H10.5a1.7 1.7 0 0 0 1-1.55V4.3a2.1 2.1 0 1 1 4.2 0v.1a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.9-.35l.06-.06a2.1 2.1 0 1 1 2.95 2.95l-.06.06a1.7 1.7 0 0 0-.35 1.9V10.5a1.7 1.7 0 0 0 1.55 1h.1a2.1 2.1 0 1 1 0 4.2h-.1a1.7 1.7 0 0 0-1.55 1Z"/>',
  power: '<path d="M12 3v8"/><path d="M6.5 6.5a8 8 0 1 0 11 0"/>',
  menu: '<path d="M4 6.5h16M4 12h16M4 17.5h16"/>',
  chevronLeft: '<path d="M14.5 5 8 12l6.5 7"/>',
  download: '<path d="M12 3.5v11.3"/><path d="m7.2 10.3 4.8 4.8 4.8-4.8"/><path d="M4.5 17.5v2a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-2"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.3"/><path d="m20 20-4.4-4.4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  pencil: '<path d="m14.2 4.2 5.6 5.6L8.4 21.2H2.8v-5.6Z"/><path d="m12.1 6.3 5.6 5.6"/>',
  trash: '<path d="M4.5 7h15"/><path d="M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2"/><path d="M6.5 7 7.3 19a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7"/><path d="M10.3 11v6M13.7 11v6"/>',
  pin: '<path d="M12 2.8c2.6 0 4.7 2.1 4.7 4.7 0 3.3-4.7 8.7-4.7 8.7s-4.7-5.4-4.7-8.7c0-2.6 2.1-4.7 4.7-4.7Z"/><circle cx="12" cy="7.5" r="1.7"/><path d="M12 16.2V21"/>',
  alertTriangle: '<path d="M12 3.7 21.5 20H2.5Z"/><path d="M12 9.5v4.2"/><circle cx="12" cy="16.7" r="0.9" fill="currentColor" stroke="none"/>',
  arrowUp: '<path d="M12 19V6M6 11.5 12 5.5 18 11.5"/>',
  arrowDown: '<path d="M12 5v13M18 12.5 12 18.5 6 12.5"/>',
  scale: '<path d="M12 3v18M8 21h8"/><path d="m5 8-2.5 5a2.5 2.5 0 0 0 5 0Z"/><path d="m19 8-2.5 5a2.5 2.5 0 0 0 5 0Z"/><path d="M4 8h4M16 8h4M8 8l4-2 4 2"/>',
  flame: '<path d="M12 21.5c3.6 0 6.5-2.6 6.5-6.3 0-3.4-2.3-5.4-3.2-7.6-.4 1.4-1.2 2.4-2.1 2.4-1.3 0-1.4-1.6-1.4-2.7 0-1.9.9-3.5.9-3.5-3.6 1.7-6.2 5.2-6.2 8.7 0 4.7 2.9 9 5.5 9Z"/>',
  receipt: '<path d="M6 3.5h12v17l-2.2-1.4-2 1.4-1.8-1.4-2 1.4-1.8-1.4-2.2 1.4Z"/><path d="M8.5 8h7M8.5 11.3h7M8.5 14.6h4.5"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m4.5 12.5 5 5L19.5 7"/>',
  camera: '<path d="M4 8.2A1.7 1.7 0 0 1 5.7 6.5H8l1.2-2h5.6l1.2 2h2.3a1.7 1.7 0 0 1 1.7 1.7V18a1.7 1.7 0 0 1-1.7 1.7H5.7A1.7 1.7 0 0 1 4 18Z"/><circle cx="12" cy="13" r="3.6"/>',
  upload: '<path d="M12 20.5V9.2"/><path d="m7.2 13.6 4.8-4.8 4.8 4.8"/><path d="M4.5 17.5v2a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-2"/><path d="M4.5 6h15"/>',
  logo: '<path d="M12 3.3c3 1.8 5.6 2.6 8.2 2.7-.2 6.8-2.9 11.7-8.2 14.7C6.7 17.7 4 12.8 3.8 6c2.6-.1 5.2-.9 8.2-2.7Z"/>',
};

// Retorna a marcação SVG pronta. name = uma chave de PATHS.
// size em px (padrão 18). className extra é opcional.
export function icon(name, size = 18, className = "") {
  const body = PATHS[name] || "";
  return `<svg class="icon ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
