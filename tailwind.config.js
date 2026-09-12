/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./*.js",
        "./src/**/*.{js,ts,jsx,tsx,html}"
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                primary: '#2563eb',
                secondary: '#1e40af',
            },
            fontFamily: {
                cairo: ['Cairo', 'sans-serif'],
            },
            animation: {
                'fade-in': 'fadeIn 0.5s ease-out',
                'bounce-slow': 'bounce 3s infinite',
                'slide-up': 'slideUp 0.4s ease-out',
                'pulse-slow': 'pulse 3s infinite',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' }
                },
                slideUp: {
                    '0%': { transform: 'translateY(20px)', opacity: '0' },
                    '100%': { transform: 'translateY(0)', opacity: '1' }
                }
            }
        }
    },
    plugins: [],
}
