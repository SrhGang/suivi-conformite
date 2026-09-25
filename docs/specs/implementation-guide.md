# 🚀 Guide d'Implémentation du Système de Design

Suivi de Conformité ISO 27001 / NIS2-ANSSI

---

## Table des Matières

1. [Démarrage Rapide](#démarrage-rapide)
2. [Installation](#installation)
3. [Utilisation des Couleurs](#utilisation-des-couleurs)
4. [Composants Courants](#composants-courants)
5. [Bonnes Pratiques](#bonnes-pratiques)
6. [FAQ](#faq)

---

## 🎯 Démarrage Rapide

### Option 1 : CSS Variables (Vanille)

```html
<!-- Copier le fichier design-system.css -->
<link rel="stylesheet" href="path/to/design-system.css">

<!-- Utiliser directement -->
<button style="background: var(--primary-800); color: white; padding: var(--space-md) var(--space-lg);">
  Créer
</button>
```

### Option 2 : Tailwind CSS

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

Remplacer le contenu de `tailwind.config.js` par le fichier fourni.

```jsx
<button className="px-lg py-md bg-primary-800 text-white rounded-md hover:bg-primary-700 shadow-md">
  Créer
</button>
```

### Option 3 : SCSS Variables

```scss
@import 'path/to/design-system.css';
// Ou créer un fichier _variables.scss avec les mêmes valeurs

.btn-primary {
  background: var(--primary-800);
  color: white;
  padding: var(--space-md) var(--space-lg);
  border-radius: 6px;
  
  &:hover {
    background: var(--primary-700);
  }
}
```

---

## 📦 Installation

### 1. **Copier les fichiers de design**

```bash
# Créer dossier design system
mkdir src/design-system

# Copier les fichiers
cp design-system.css src/design-system/
cp tailwind.config.js ./ # Si Tailwind
```

### 2. **Importer dans votre app**

**React :**
```jsx
// main.jsx ou App.jsx
import './design-system/design-system.css'
```

**Vue :**
```js
// main.js
import './design-system/design-system.css'
```

**Angular :**
```json
// angular.json
"styles": [
  "src/design-system/design-system.css",
  "src/styles.css"
]
```

### 3. **Vérifier l'installation**

Ouvrir les DevTools (F12) et vérifier que les variables sont disponibles :

```js
// Console
getComputedStyle(document.documentElement).getPropertyValue('--primary-800')
// Retour: #0F3460
```

---

## 🎨 Utilisation des Couleurs

### Couleurs Primaires

```html
<!-- HTML -->
<button style="background: var(--primary-800);">Primaire</button>
<div style="background: var(--primary-700);">Primaire 700</div>
```

```css
/* CSS */
.header {
  background: var(--primary-800);
  color: white;
}

.link {
  color: var(--primary-700);
  
  &:hover {
    color: var(--primary-600);
  }
}
```

```jsx
// React
<div className="bg-primary-800 text-white">
  Contenu
</div>
```

### Couleurs de Statut

```html
<!-- Succès -->
<div style="background: var(--success-light); color: var(--success);">
  ✓ Opération réussie
</div>

<!-- Erreur -->
<div style="background: var(--error-light); color: var(--error);">
  ✕ Une erreur est survenue
</div>

<!-- Avertissement -->
<div style="background: var(--warning-light); color: var(--warning);">
  ⚠ Attention requise
</div>

<!-- Info -->
<div style="background: var(--info-light); color: var(--info);">
  ℹ Information
</div>
```

### Utilisation avec Tailwind

```jsx
// Couleur primaire
<button className="bg-primary-800 hover:bg-primary-700 text-white">
  Bouton
</button>

// Couleur de succès
<div className="bg-success-light text-success-dark">
  Succès
</div>

// Couleur neutre
<p className="text-neutral-600">Texte secondaire</p>
```

---

## 🧩 Composants Courants

### Bouton Primaire

#### HTML + CSS
```html
<button class="btn btn-primary">
  Créer lacune
</button>
```

```css
.btn {
  padding: var(--space-md) var(--space-lg);
  font-weight: var(--font-weight-semibold);
  border-radius: var(--radius-md);
  border: none;
  cursor: pointer;
  transition: all var(--transition-base);
}

.btn-primary {
  background: var(--primary-800);
  color: white;
  box-shadow: var(--shadow-sm);
}

.btn-primary:hover {
  background: var(--primary-700);
  box-shadow: var(--shadow-md);
}
```

#### React
```jsx
export function Button({ variant = 'primary', children, ...props }) {
  const variants = {
    primary: 'bg-primary-800 hover:bg-primary-700 text-white shadow-sm hover:shadow-md',
    secondary: 'bg-neutral-100 hover:bg-neutral-200 text-primary-800 border border-neutral-300',
    accent: 'bg-accent hover:bg-accent-light text-white shadow-sm hover:shadow-md',
  }

  return (
    <button
      className={`px-lg py-md rounded-md font-semibold transition-all duration-base ${variants[variant]}`}
      {...props}
    >
      {children}
    </button>
  )
}

// Utilisation
<Button variant="primary">Créer lacune</Button>
<Button variant="secondary">Annuler</Button>
<Button variant="accent">Valider</Button>
```

#### Vue
```vue
<template>
  <button
    :class="[
      'btn',
      {
        'btn-primary': variant === 'primary',
        'btn-secondary': variant === 'secondary',
        'btn-accent': variant === 'accent',
      }
    ]"
  >
    <slot />
  </button>
</template>

<script setup>
defineProps({
  variant: {
    type: String,
    default: 'primary',
    validator: (v) => ['primary', 'secondary', 'accent'].includes(v),
  },
})
</script>

<style scoped>
.btn {
  padding: var(--space-md) var(--space-lg);
  font-weight: var(--font-weight-semibold);
  border-radius: var(--radius-md);
  border: none;
  cursor: pointer;
  transition: all var(--transition-base);
}

.btn-primary {
  background: var(--primary-800);
  color: white;
  box-shadow: var(--shadow-sm);
}

.btn-primary:hover {
  background: var(--primary-700);
  box-shadow: var(--shadow-md);
}

.btn-secondary {
  background: var(--neutral-100);
  color: var(--primary-800);
  border: 1px solid var(--neutral-300);
}

.btn-secondary:hover {
  background: var(--neutral-200);
}

.btn-accent {
  background: var(--accent);
  color: white;
  box-shadow: var(--shadow-sm);
}

.btn-accent:hover {
  background: var(--accent-light);
  box-shadow: var(--shadow-md);
}
</style>
```

### Carte (Card)

#### HTML + CSS
```html
<div class="card">
  <h3>Titre</h3>
  <p>Contenu de la carte</p>
</div>
```

```css
.card {
  background: white;
  padding: var(--space-xl);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}

.card h3 {
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-semibold);
  color: var(--primary-800);
  margin-bottom: var(--space-lg);
}

.card p {
  font-size: var(--font-size-body);
  color: var(--neutral-600);
  line-height: var(--line-height-comfortable);
}
```

#### React
```jsx
export function Card({ title, children, className = '' }) {
  return (
    <div className={`bg-white p-xl rounded-lg shadow-md ${className}`}>
      {title && (
        <h3 className="text-xl font-semibold text-primary-800 mb-lg">
          {title}
        </h3>
      )}
      {children}
    </div>
  )
}

// Utilisation
<Card title="Lacunes Critiques">
  <p>Contenu ici...</p>
</Card>
```

### Badge (Statut)

#### HTML + CSS
```html
<span class="badge badge-success">Validée</span>
<span class="badge badge-error">Critique</span>
<span class="badge badge-warning">En retard</span>
<span class="badge badge-info">En cours</span>
```

```css
.badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: var(--radius-full);
  font-size: var(--font-size-tiny);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
}

.badge-success {
  background: var(--success-light);
  color: var(--success);
}

.badge-error {
  background: var(--error-light);
  color: var(--error);
}

.badge-warning {
  background: var(--warning-light);
  color: var(--warning);
}

.badge-info {
  background: var(--info-light);
  color: var(--info);
}
```

#### React
```jsx
export function Badge({ status, children }) {
  const statusColors = {
    success: 'bg-success-light text-success',
    error: 'bg-error-light text-error',
    warning: 'bg-warning-light text-warning',
    info: 'bg-info-light text-info',
  }

  return (
    <span className={`inline-block px-lg py-xs rounded-full text-xs font-semibold uppercase tracking-wide ${statusColors[status]}`}>
      {children}
    </span>
  )
}

// Utilisation
<Badge status="success">Validée</Badge>
<Badge status="error">Critique</Badge>
```

### Input Field

#### HTML + CSS
```html
<input type="text" class="input" placeholder="Chercher...">
<textarea class="input" placeholder="Description..."></textarea>
<select class="input">
  <option>Option 1</option>
</select>
```

```css
.input {
  width: 100%;
  padding: var(--space-md);
  font-size: var(--font-size-body);
  border: 1px solid var(--neutral-300);
  border-radius: var(--radius-md);
  font-family: var(--font-family-system);
  transition: all var(--transition-base);
}

.input:focus {
  outline: none;
  border-color: var(--primary-700);
  box-shadow: 0 0 0 3px rgba(27, 94, 143, 0.1);
}

.input:disabled {
  background: var(--neutral-50);
  color: var(--neutral-500);
  cursor: not-allowed;
}
```

#### React
```jsx
export function Input({ label, error, ...props }) {
  return (
    <div className="mb-base">
      {label && (
        <label className="block text-sm font-medium text-primary-800 mb-sm">
          {label}
        </label>
      )}
      <input
        className={`w-full px-md py-md border rounded-md focus:outline-none focus:ring-2 transition-all ${
          error
            ? 'border-error focus:border-error focus:ring-error/10'
            : 'border-neutral-300 focus:border-primary-700 focus:ring-primary-500/10'
        }`}
        {...props}
      />
      {error && <p className="text-sm text-error mt-sm">{error}</p>}
    </div>
  )
}

// Utilisation
<Input 
  label="Titre de la lacune"
  placeholder="Ex: MFA non configurée"
  error={errors.title}
/>
```

---

## ✨ Bonnes Pratiques

### 1. **Toujours utiliser les variables**

✅ **BON**
```css
.element {
  color: var(--primary-800);
  padding: var(--space-lg);
  box-shadow: var(--shadow-md);
}
```

❌ **MAUVAIS**
```css
.element {
  color: #0F3460;
  padding: 20px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}
```

### 2. **Maintenir la hiérarchie des espacements**

✅ **BON**
```jsx
<div className="p-xl gap-lg">
  {/* Utiliser l'échelle : xs(4), sm(8), md(12), base(16), lg(20), xl(24)... */}
</div>
```

❌ **MAUVAIS**
```jsx
<div className="p-5 gap-13">
  {/* Valeurs arbitraires = incohérence */}
</div>
```

### 3. **Respecter les ratios de contraste**

Combiner toujours :
- Texte blanc sur `primary-800` ✓
- Texte blanc sur `accent` ✓
- Texte `primary-800` sur `neutral-50` ✓
- Texte `neutral-600` sur `neutral-100` ✓

### 4. **Utiliser les transitions pour l'interactivité**

```css
.interactive-element {
  transition: all var(--transition-base);
}

.interactive-element:hover {
  /* Les changements sont animés */
}
```

### 5. **Créer des composants réutilisables**

Au lieu de répéter le styling, créer des composants :

```jsx
// ❌ Répétition
<button className="px-lg py-md bg-primary-800...">Créer</button>
<button className="px-lg py-md bg-primary-800...">Modifier</button>

// ✅ Composant réutilisable
<Button>Créer</Button>
<Button>Modifier</Button>
```

---

## 🎓 Bonnes Pratiques - Responsive Design

### Utiliser les media queries du système

```css
/* Mobile-first approach */
.grid {
  grid-template-columns: 1fr;
  gap: var(--space-lg);
}

@media (min-width: 768px) {
  .grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1024px) {
  .grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
```

### Avec Tailwind

```jsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-lg">
  {/* Automatique */}
</div>
```

---

## ❓ FAQ

### **Q: Comment changer la couleur primaire globalement ?**

A: Modifier la variable CSS dans `:root` :

```css
:root {
  --primary-800: #NOUVELLECOULEUR;
  /* Tous les éléments utilisant cette variable se mettent à jour */
}
```

### **Q: Puis-je ajouter mes propres variables ?**

A: Oui, ajouter directement dans `:root` :

```css
:root {
  /* Vos nouvelles variables */
  --my-custom-color: #FF00FF;
  --my-spacing: 64px;
}

/* Utilisation */
.element {
  color: var(--my-custom-color);
  padding: var(--my-spacing);
}
```

### **Q: Comment implémenter le dark mode ?**

A: Utiliser `@media (prefers-color-scheme: dark)` ou une classe :

```css
:root {
  --bg: white;
  --text: #0D1117;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0D1117;
    --text: white;
  }
}

/* Ou avec une classe */
html.dark :root {
  --bg: #0D1117;
  --text: white;
}
```

### **Q: Les variables fonctionnent-elles sur tous les navigateurs ?**

A: Oui, elles sont supportées sur 95%+ des navigateurs modernes.
[Caniuse: CSS Custom Properties](https://caniuse.com/css-variables)

### **Q: Comment migrer depuis une autre palette de couleurs ?**

A: Créer un fichier de mapping :

```css
/* Ancien système */
:root {
  --old-primary: var(--primary-800);
  --old-accent: var(--accent);
}
```

Puis remplacer progressivement dans le code.

### **Q: Faut-il utiliser Tailwind ou CSS Variables ?**

A: 
- **CSS Variables** : Simplicité, léger, contrôle total
- **Tailwind** : Productivité, prédictibilité, écosystème riche

Vous pouvez aussi **combiner les deux** ! Tailwind utilise les CSS Variables en interne.

---

## 📚 Ressources Supplémentaires

- [MDN - CSS Custom Properties](https://developer.mozilla.org/en-US/docs/Web/CSS/--*)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Web Accessibility Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Color Contrast Checker](https://webaim.org/resources/contrastchecker/)

---

**Besoin d'aide ? Consultez le guide de design complet : `design-guide-complet.html`**
