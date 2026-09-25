/**
 * Configuration Tailwind CSS
 * Suivi de Conformité ISO 27001 / NIS2-ANSSI
 * 
 * À utiliser : npx tailwindcss init -p
 * Puis remplacer la config par celle-ci
 */

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      /* ========================================
         COULEURS
         ======================================== */
      colors: {
        /* Primaires */
        primary: {
          50: '#F0F6FC',
          100: '#E0ECFF',
          200: '#BCDAFF',
          300: '#8FC7FF',
          400: '#5FB5FF',
          500: '#3491D6',
          600: '#2779B9',
          700: '#1B5E8F',
          800: '#0F3460',
          900: '#051627',
        },
        /* Secondaires */
        secondary: {
          50: '#FEF5F0',
          100: '#FDE8DE',
          200: '#FCC8B0',
          300: '#FAA27F',
          400: '#F7784E',
          500: '#E97A4C',
          600: '#BC613D',
          700: '#8C472E',
          800: '#5C2E1F',
          900: '#2C1810',
        },
        /* Accent */
        accent: {
          light: '#F5917F',
          lighter: '#F26B5E',
          DEFAULT: '#E94B3C',
          dark: '#C23C2A',
        },
        /* Statuts */
        success: {
          light: '#D5F4E6',
          DEFAULT: '#27AE60',
          dark: '#1E8449',
        },
        warning: {
          light: '#FCE5D5',
          DEFAULT: '#F39C12',
          dark: '#D68910',
        },
        error: {
          light: '#FADBD8',
          DEFAULT: '#E74C3C',
          dark: '#C0392B',
        },
        info: {
          light: '#D6EAF8',
          DEFAULT: '#3498DB',
          dark: '#2980B9',
        },
        /* Neutres */
        neutral: {
          50: '#F8F9FA',
          100: '#E9ECEF',
          200: '#DEE2E6',
          300: '#CED4DA',
          400: '#ADB5BD',
          500: '#6C757D',
          600: '#495057',
          700: '#343A40',
          800: '#212529',
          900: '#0D1117',
        },
      },

      /* ========================================
         ESPACEMENTS
         ======================================== */
      spacing: {
        xs: '4px',
        sm: '8px',
        md: '12px',
        base: '16px',
        lg: '20px',
        xl: '24px',
        '2xl': '32px',
        '3xl': '40px',
        '4xl': '48px',
        '5xl': '64px',
        '6xl': '80px',
      },

      /* ========================================
         TYPOGRAPHIE
         ======================================== */
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'Oxygen',
          'Ubuntu',
          'Cantarell',
          'sans-serif',
        ],
        mono: [
          '"Courier New"',
          'Courier',
          'monospace',
        ],
      },

      fontSize: {
        xs: ['0.75rem', { lineHeight: '1.4' }],        // 12px
        sm: ['0.875rem', { lineHeight: '1.5' }],       // 14px
        base: ['1rem', { lineHeight: '1.6' }],         // 16px
        lg: ['1.125rem', { lineHeight: '1.5' }],       // 18px
        xl: ['1.25rem', { lineHeight: '1.4' }],        // 20px
        '2xl': ['1.75rem', { lineHeight: '1.3' }],     // 28px
        '3xl': ['2rem', { lineHeight: '1.2' }],        // 32px
      },

      fontWeight: {
        regular: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
      },

      lineHeight: {
        tight: '1.2',
        snug: '1.3',
        normal: '1.4',
        relaxed: '1.5',
        comfortable: '1.6',
      },

      letterSpacing: {
        tight: '-0.02em',
        subtle: '-0.01em',
        normal: '0em',
        wide: '0.05em',
        wider: '0.1em',
      },

      /* ========================================
         BORDER RADIUS
         ======================================== */
      borderRadius: {
        sm: '4px',
        md: '6px',
        lg: '8px',
        xl: '12px',
        '2xl': '16px',
      },

      /* ========================================
         OMBRES
         ======================================== */
      boxShadow: {
        xs: '0 1px 2px rgba(15, 52, 96, 0.05)',
        sm: '0 2px 4px rgba(15, 52, 96, 0.08)',
        md: '0 2px 8px rgba(15, 52, 96, 0.1)',
        lg: '0 8px 24px rgba(15, 52, 96, 0.15)',
        xl: '0 20px 40px rgba(15, 52, 96, 0.2)',
      },

      /* ========================================
         TRANSITIONS
         ======================================== */
      transitionDuration: {
        fast: '100ms',
        base: '200ms',
        slow: '300ms',
        slower: '500ms',
      },

      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },

      /* ========================================
         Z-INDEX
         ======================================== */
      zIndex: {
        auto: 'auto',
        hide: '-1',
        base: '0',
        dropdown: '100',
        sticky: '200',
        fixed: '300',
        backdrop: '400',
        modal: '500',
        tooltip: '600',
        notification: '700',
      },

      /* ========================================
         FORMULAIRES
         ======================================== */
      flex: {
        auto: '1 1 auto',
        initial: '0 1 auto',
        none: 'none',
        1: '1 1 0%',
      },
    },
  },

  /* ========================================
     PLUGINS
     ======================================== */
  plugins: [
    /**
     * Optionnel : Plugin forms (meilleur styling par défaut)
     * npm install -D @tailwindcss/forms
     * require('@tailwindcss/forms'),
     */
  ],

  /* ========================================
     COREPLUGINS - À activer/désactiver
     ======================================== */
  corePlugins: {
    /* Désactiver les defaults et utiliser les custom */
    textOpacity: false,
    backgroundOpacity: false,
    borderOpacity: false,
  },
}

/* ========================================
   EXEMPLES D'UTILISATION
   ======================================== */

/*
// Bouton primaire
<button class="px-lg py-md bg-primary-800 text-white rounded-md font-semibold hover:bg-primary-700 shadow-md hover:shadow-lg transition-all duration-base">
  Créer lacune
</button>

// Carte (Card)
<div class="p-xl bg-white rounded-lg shadow-md">
  <h2 class="text-2xl font-bold text-primary-800 mb-lg">Titre</h2>
  <p class="text-base font-regular text-neutral-600 leading-comfortable">Contenu...</p>
</div>

// Badge de statut
<span class="px-lg py-xs bg-success-light text-success text-xs font-semibold rounded-full uppercase tracking-wide">
  Validée
</span>

// Input
<input 
  type="text"
  class="px-md py-md border border-neutral-300 rounded-md focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-10"
  placeholder="Chercher..."
/>

// Grid layout
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-lg">
  <!-- Items -->
</div>

// Flexbox layout
<div class="flex items-center justify-between gap-xl p-base bg-neutral-50 rounded-md">
  <!-- Items -->
</div>

// Texte avec couleur et style
<p class="text-lg font-semibold text-primary-800 leading-snug tracking-tight mb-md">
  Titre court
</p>

// Status badge group
<div class="flex gap-sm">
  <span class="badge badge-success">Succès</span>
  <span class="badge badge-error">Erreur</span>
  <span class="badge badge-warning">Alerte</span>
  <span class="badge badge-info">Info</span>
</div>
*/
