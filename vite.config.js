import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const officialModeEntry = {
    name: 'official-mode-entry',
    transformIndexHtml() {
        return [{ tag: 'script', attrs: { type: 'module', src: '/officialMode.js' }, injectTo: 'body' }];
    }
};

export default defineConfig({
    root: '.',
    publicDir: 'public',
    esbuild: { drop: ['console', 'debugger'] },
    build: {
        outDir: 'dist',
        rollupOptions: {
            input: { main: './index.html' },
            output: {
                manualChunks: {
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
        chunkSizeWarningLimit: 600
    },
    plugins: [
        officialModeEntry,
        viteStaticCopy({
            targets: [
                { src: 'sw.js', dest: '' }, { src: 'firebase-messaging-sw.js', dest: '' },
                { src: 'manifest.json', dest: '' }, { src: 'favicon.png', dest: '' },
                { src: '_headers', dest: '' }, { src: '404.html', dest: '' },
                { src: 'offline.html', dest: '' }
            ]
        })
    ],
    server: { port: 3000, open: true }
});
