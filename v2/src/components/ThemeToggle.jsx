import {useEffect,useState} from 'react';

export default function ThemeToggle(){
  const [dark,setDark]=useState(()=>{
    const saved=localStorage.getItem('snu-theme');
    return saved?saved==='dark':window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  });
  useEffect(()=>{
    document.documentElement.dataset.theme=dark?'dark':'light';
    localStorage.setItem('snu-theme',dark?'dark':'light');
  },[dark]);
  const label=dark?'تشغيل الوضع النهاري':'تشغيل الوضع الداكن';
  return <button type="button" className="themeToggle" onClick={()=>setDark(value=>!value)} aria-label={label} title={label}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {dark?<><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/></>:<path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z"/>}
    </svg>
  </button>;
}
