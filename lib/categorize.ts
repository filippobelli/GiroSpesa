/** Parse a pasted shopping list and guess each product's department. */

export type ParsedLine = { name: string; toBuy: boolean; hadCheckbox: boolean };

/**
 * One product per line. Accepts note-app checkboxes such as "[v] Latte", "[ ] Pane",
 * "- [x] Uova", "☐ Riso", "✓ Sale"; an empty box means "still to buy".
 */
export function parseList(text: string): ParsedLine[] {
  const seen = new Set<string>();
  const lines: ParsedLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim().replace(/^[-*•·]\s*/, '');
    let toBuy = true;
    let hadCheckbox = false;
    const box = line.match(/^\[([^\]]*)\]\s*/);
    if (box) {
      hadCheckbox = true;
      toBuy = box[1].trim() === '';
      line = line.slice(box[0].length);
    } else if (/^[☐□○◯]\s*/.test(line)) {
      hadCheckbox = true;
      line = line.replace(/^[☐□○◯]\s*/, '');
    } else if (/^[☑☒✓✔✅]\s*/u.test(line)) {
      hadCheckbox = true;
      toBuy = false;
      line = line.replace(/^[☑☒✓✔✅]\s*/u, '');
    }
    const name = line
      .replace(/\p{Extended_Pictographic}|️/gu, '')
      .replace(/[.,;:]+$/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push({ name: name.charAt(0).toUpperCase() + name.slice(1), toBuy, hadCheckbox });
  }
  return lines;
}

// First match wins: specific exceptions come before the general rules.
const RULES: [string, RegExp][] = [
  // Exceptions
  ['Freschi', /mopur|lievito di birra|pasta (all.?uovo|sfoglia|brise|frolla)|tortellin|ravioli|gnocchi/],
  ['Dispensa', /farin|fecola|latte (vegetal|di cocco|di soia|di mandorl|d.?avena|di riso)|crema (di )?(nocciol|anacard|spalmabil|pistacch)|pan di stelle|pangrattato|salsa|concentrato|passata|pelati|polpa di pomodoro|aceto|\btonno\b|sgombr|acciug|frutta secca|biscott/],
  ['Igiene', /olio di mandorl|nivea|crema (mani|viso|corpo)/],
  ['Casa', /distillata|sapone (piatti|lavatrice|pavimenti)|carta igienica|detersivo/],
  // General
  ['Igiene', /dentifric|spazzolin|shampo|balsamo|bagnoschiuma|docciaschiuma|deodorant|lamett|rasoi|schiuma da barba|cotton|dischetti|struccant|fazzolett|salviett|assorbent|pannolin|sapone mani|profum|collutorio|interdental|cerott/],
  ['Casa', /pellicol|carta (forno|argentata|alluminio|cucina|assorbente)|alluminio|lisoform|lavastovigli|lavatrice|ammorbident|scottex|tovagliol|bicchier|contenitor|\bbuste\b|sacchett|napisan|acchiappa|citrosil|\bwc|vetril|^bagno$|viakal|swiffer|pavimenti|idraulic|spugn|accendi|candeggin|sgrassator|anticalcare|guanti|stracci|scopa/],
  ['Panetteria', /\bpane\b|\bpanin|piadin|wasa|focacc|grissin|baguette|pancarre|pan bauletto/],
  ['Pesce', /salmon|merluzz|orata|branzin|gamber|calamar|cozze|vongol|\bpesce\b|polpo|seppi|spigol/],
  ['Surgelati', /ghiaccio|surgel|gelat|bastoncin|sofficin|frozen/],
  ['Bevande', /\bvin[oi]\b|\bgin\b|\bbirr[ae]\b|acqua|tonica|succo|succhi|\bcoca|aranciata|\bthe\b|\bte\b freddo|spumante|prosecco|vodka|\brum\b|whisky|aperol|bibit|chinotto|gassosa/],
  ['Freschi', /\blatte\b|yogurt|kefir|burro|panna|formagg|parmigian|grana|pecorino|mozzarell|stracchin|scamorz|feta|philadelphia|ricotta|gorgonzol|primo sale|mascarpone|\buov[ao]|prosciutt|salame|mortadell|speck|wurstel|hot ?dog|burger|pollo|tacchino|carne|macinat|salsicc|bresaola|budin|tofu|hummus|affettat|emmental|provola|fontina/],
  ['Ortofrutta', /pomodor|banan|percoc|pesch[ei]|spinac|verdur|zucchin|insalat|lattuga|rucola|\bmel[ae]\b|\bper[ae]\b|arance|mandarin|limon|patat|carot|cipoll|aglio|finocch|peperon|melanzan|fragol|kiwi|\buva\b|avocado|broccol|cavol|funghi|zucca|sedano|basilico|prezzemol|frutta|ananas|anguria|melone|ciliegi|albicocc|prugne fresche/],
  ['Dispensa', /pasta|spaghett|penne|fusilli|lasagn|riso|farin|zuccher|\bsale\b|olio|caffe|cacao|nutella|crema|marmellat|confettur|miele|lenticch|fagiol|ceci|pisell|farro|maionese|senape|ketchup|soia|lievito|amido|fecola|zafferano|spezie|pepe|origano|olive|cracker|taralli|tarallin|gallett|cereal|muesli|avena|semi|\bnoci\b|anacard|mandorl|nocciol|pistacch|datteri|prugne|uvetta|lupini|cioccolat|caramell|merendin|sciropp|cocco|bicarbonato|zuccherini|codette|ringo|fette biscottate|brodo|dado|legumi|tisan|camomill/],
];

const DISPENSA_RULES: [string, RegExp][] = [
  ['Altro', /farin|salsa|fecola|amido/],
  ['Pesce', /tonno|sgombr|acciug|sardin|alici|salmone affumicato|filetti di/],
  ['Legumi', /lenticch|fagiol|\bceci\b|pisell|lupini|legumi|\bfave\b|edamame|cicerchi/],
  ['Pane', /pangrattato|cracker|taralli|tarallin|gallett|grissin|fette biscottate|wasa|frisell|crostin|pancarre|pan carre|piadin|pane/],
  ['Dolci', /biscott|zuccher|cacao|nutella|crema (di )?(nocciol|anacard|pistacch|spalmabil|mandorl)|marmellat|confettur|miele|merendin|cioccolat|caramell|codette|ringo|pan di stelle|sciropp|gocce|lievito dolci|lievito per dolci|muesli|cereal|soffiat|budin|\bdolci\b|dolcific|wafer|torta|savoiardi|canditi|vanigl|zuccherini/],
];

function normalize(name: string) {
  return name.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

/** Subcategory of a pantry product: Dolci, Pane, Pesce, Legumi or Altro. */
export function dispensaSub(name: string): string {
  const n = normalize(name);
  for (const [sub, pattern] of DISPENSA_RULES) if (pattern.test(n)) return sub;
  return 'Altro';
}

export function categorize(name: string): string {
  const n = normalize(name);
  for (const [category, pattern] of RULES) {
    if (pattern.test(n)) return category === 'Dispensa' ? `Dispensa · ${dispensaSub(name)}` : category;
  }
  return 'Altro';
}
