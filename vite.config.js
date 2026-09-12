import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
    root: '.',
    publicDir: 'public',
    // حذف console.log و debugger من ملفات الإنتاج
    esbuild: {
        drop: ['console', 'debugger'],
    },
    build: {
        outDir: 'dist',
        rollupOptions: {
            input: {
                main: './index.html'
            },
            output: {
                manualChunks: {
                    // Split large modules into separate chunks
                    'admin': ['./admin.js'],
                    'quiz': ['./quiz.js'],
                    'social': ['./social.js', './dm.js', './groupChat.js'],
                    'features': ['./features.js', './gamification.js'],
                    'auth': ['./auth.js'],
                    'cms': ['./cms.js'],
                    'attendance': ['./attendance.js']
                }
            }
        },
        copyPublicDir: true,
        chunkSizeWarningLimit: 600 // Increase limit since we're splitting
    },
    plugins: [
        viteStaticCopy({
            targets: [
                { src: 'sw.js', dest: '' },
                { src: 'firebase-messaging-sw.js', dest: '' },
                { src: 'manifest.json', dest: '' },
                { src: 'favicon.png', dest: '' },
                { src: '_headers', dest: '' },
                { src: '404.html', dest: '' },
                { src: 'offline.html', dest: '' }
            ]
        })
    ],
    server: {
        port: 3000,
        open: true
    }
});
