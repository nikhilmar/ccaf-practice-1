const { useCallback, useEffect, useState } = React;
const { clearActive, getActive, getAttempts, saveActive, saveAttempt } = window.CcaDb;

const LETTERS = ['A', 'B', 'C', 'D'];
const stamp = value => new Date(value).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const fmt = seconds => {
  const safe = Math.max(0, seconds || 0);
  return String(Math.floor(safe / 3600)).padStart(2, '0') + ':' + String(Math.floor((safe % 3600) / 60)).padStart(2, '0') + ':' + String(safe % 60).padStart(2, '0');
};
const DOMAIN_WEIGHTS = [
  { name: 'Agentic Architecture & Orchestration', short: 'Agentic architecture', quota: 16, pattern: /agent|orchestrat|subagent|coordinator|delegat|stop_reason|handoff|parallel|loop|multi-agent/gi },
  { name: 'Claude Code Configuration & Workflows', short: 'Claude Code workflows', quota: 12, pattern: /claude code|claude\.md|slash command|permission|hook|ci\/cd|pipeline|settings|configuration|headless/gi },
  { name: 'Prompt Engineering & Structured Output', short: 'Prompt & structured output', quota: 12, pattern: /prompt|few.shot|json schema|structured output|validation|schema|system instruction|output format/gi },
  { name: 'Tool Design & MCP Integration', short: 'Tools & MCP', quota: 11, pattern: /\bmcp\b|tool|api|server|client|execution boundary|function call/gi },
  { name: 'Context Management & Reliability', short: 'Context & reliability', quota: 9, pattern: /context|token|cache|retry|fallback|reliab|long conversation|history|truncat/gi },
];
const shuffle = items => { const out = [...items]; for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; } return out; };
const classifyQuestion = q => {
  const text = [q.question, ...Object.values(q.options || {}), q.explanation].join(' ');
  const ranked = DOMAIN_WEIGHTS.map((d, i) => ({ i, score: (text.match(d.pattern) || []).length }));
  ranked.sort((a, b) => b.score - a.score || a.i - b.i);
  return DOMAIN_WEIGHTS[ranked[0].i].name;
};
const sampleExam = bank => {
  const pools = DOMAIN_WEIGHTS.map(d => shuffle(bank.filter(q => q.domain === d.name)));
  const picked = [];
  pools.forEach((pool, i) => picked.push(...pool.slice(0, DOMAIN_WEIGHTS[i].quota)));
  return shuffle(picked);
};
const correctCount = session => session.questions.filter(q => session.answers[q.questionHash] === q.correctAnswer).length;

function App() {
  const [bank, setBank] = useState([]);
  const [history, setHistory] = useState([]);
  const [session, setSession] = useState(null);
  const [page, setPage] = useState('home');
  const [active, setActive] = useState(null);
  const [current, setCurrent] = useState(0);
  const [filter, setFilter] = useState('All Questions');
  const [seconds, setSeconds] = useState(0);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('');

  const refreshHistory = useCallback(async () => {
    const rows = await getAttempts();
    setHistory((rows || []).sort((a, b) => b.finishedAt - a.finishedAt));
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('./public/question-bank.json').then(r => { if (!r.ok) throw new Error('Question bank could not be loaded.'); return r.json(); }),
      getAttempts(), getActive(),
    ]).then(([data, attempts, saved]) => {
      const rows = Array.isArray(data.questions) ? data.questions : Object.values(data.questions || {});
      if (cancelled) return;
      setBank(rows.filter(q => q.question && q.options && q.correctAnswer && q.explanation).map(q => ({ ...q, domain: classifyQuestion(q) }))); 
      setHistory((attempts || []).sort((a, b) => b.finishedAt - a.finishedAt));
      setActive(saved || null);
      setReady(true);
    }).catch(err => { setMessage(err.message || 'Unable to open local IndexedDB storage.'); setReady(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (page !== 'quiz' || !session) return undefined;
    const tick = () => {
      const left = Math.max(0, Math.ceil((session.deadline - Date.now()) / 1000));
      setSeconds(left);
      if (left === 0 && !session.finishedAt) finish(session, true);
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [page, session]);

  async function startExam() {
    if (!bank.length) return;
    const selected = sampleExam(bank);
    if (selected.length !== 60) { setMessage('The question bank does not have enough questions in every exam domain.'); return; }
    const newSession = {
      id: crypto.randomUUID(), current: 0, startedAt: Date.now(), deadline: Date.now() + 120 * 60 * 1000,
      durationSec: 120 * 60, questions: selected, answers: {}, marked: [],
    };
    await saveActive(newSession);
    setSession(newSession); setCurrent(0); setPage('quiz'); setSeconds(newSession.durationSec);
  }

  async function finish(target = session, timeExpired = false) {
    if (!target || target.finishedAt) return;
    const completed = { ...target, finishedAt: Date.now(), timeExpired, remainingSec: Math.max(0, Math.ceil((target.deadline - Date.now()) / 1000)) };
    await saveAttempt(completed);
    await clearActive();
    setActive(null); setSession(completed); setPage('review'); setFilter('All Questions');
    await refreshHistory();
  }

  function answer(key) {
    setSession(prev => {
      const next = { ...prev, answers: { ...prev.answers, [prev.questions[current].questionHash]: key } };
      saveActive(next).catch(() => setMessage('Could not save this answer to IndexedDB.'));
      return next;
    });
  }

  function navigateTo(index) {
    setCurrent(index);
    setSession(prev => { const next = { ...prev, current: index }; saveActive(next).catch(() => setMessage('Could not save your place in IndexedDB.')); return next; });
  }

  function toggleMark() {
    setSession(prev => {
      const id = prev.questions[current].questionHash;
      const marked = prev.marked.includes(id) ? prev.marked.filter(x => x !== id) : [...prev.marked, id];
      const next = { ...prev, marked };
      saveActive(next).catch(() => setMessage('Could not save this mark to IndexedDB.'));
      return next;
    });
  }

  async function resume() {
    if (!active) return;
    setSession(active); setCurrent(active.current || 0); setPage('quiz');
  }
  async function discardActive() { await clearActive(); setActive(null); }
  function openAttempt(row) { setSession(row); setFilter('All Questions'); setPage('review'); }
  function returnHome() { setSession(null); setPage('home'); }

  const answered = session ? Object.keys(session.answers || {}).length : 0;
  const activeQuestion = session?.questions[current];
  const selectedKey = activeQuestion ? session.answers[activeQuestion.questionHash] : null;
  const left = session ? Math.max(0, Math.ceil((session.deadline - Date.now()) / 1000)) : seconds;
  const missed = session ? session.questions.length - correctCount(session) : 0;

  if (!ready) return <div className="loading"><div className="brand-mark">C</div><p>Preparing your practice room...</p></div>;

  return <div className="app-shell">
    <header className="topbar">
      <button className="brand" onClick={returnHome} aria-label="Go to dashboard"><span className="brand-mark">C</span><span>ARCHITECT<span className="brand-light"> / PRACTICE</span></span></button>
      <div className="topbar-right"><span className="live-dot"/> BROWSER-BASED PRACTICE <span className="avatar">NM</span></div>
    </header>
    {message && <div className="toast" role="status">{message}<button onClick={() => setMessage('')}>Dismiss</button></div>}

    {page === 'home' && <main className="dashboard wrap">
      <section className="hero">
        <div className="hero-copy"><div className="eyebrow"><span className="eyebrow-line"/> FOUNDATIONS CERTIFICATION</div>
          <h1>Make your next<br/><em>move</em> with confidence.</h1>
          <p>A focused practice room for architecting reliable Claude systems. Take a timed practice exam, then review every answer and explanation.</p>
          <div className="hero-actions"><button className="primary-btn" onClick={startExam}>Start a timed test <span>↗</span></button><span className="micro-copy">350 curated practice questions</span></div>
        </div>
        <div className="hero-art"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="hero-glyph">C<span>.</span></div><div className="art-caption">SYSTEMS THINKING<br/>IN PRACTICE</div><span className="spark spark-a">✳</span><span className="spark spark-b">✳</span></div>
      </section>

      <section className="setup-panel">
        <div className="section-kicker">01 / EXAM FORMAT</div><h2>60 questions · 120 minutes</h2><p className="muted">A fresh random, domain-balanced selection from the complete question bank.</p>
        <div className="config-row">
          <div className="fixed-field"><span>QUESTION SET</span><b>60 questions</b></div>
          <div className="fixed-field"><span>TIME LIMIT</span><b>120 minutes</b></div>
          <div className="test-note"><span className="note-icon">◷</span><span><b>Timed conditions</b><small>Timer starts when you begin.<br/>Your progress saves automatically.</small></span></div>
        </div>
        <div className="domain-weights">{DOMAIN_WEIGHTS.map(d => <span key={d.name}><b>{d.quota}</b> {d.short} <i>{Math.round(d.quota / 60 * 100)}%</i></span>)}</div>
      </section>

      {active && <section className="resume-card"><div className="resume-icon">↗</div><div className="resume-copy"><span className="section-kicker">SESSION IN PROGRESS</span><h3>Pick up where you left off</h3><p>{active.questions.length} questions · {Object.keys(active.answers || {}).length} answered · time continues from your original start</p></div><button className="outline-btn" onClick={resume}>Resume session</button><button className="text-btn" onClick={discardActive}>Discard</button></section>}

      <section className="history-section"><div className="section-heading"><div><div className="section-kicker">02 / YOUR PROGRESS</div><h2>Previous attempts</h2></div><span className="history-count">{history.length} {history.length === 1 ? 'ATTEMPT' : 'ATTEMPTS'}</span></div>
        {history.length === 0 ? <div className="empty-state"><div className="empty-icon">▤</div><div><b>Your history starts here.</b><p>Complete a timed test to see your score and answer-by-answer review.</p></div></div> : <div className="attempt-list">{history.map((row, i) => {
          const total = row.questions.length, correct = correctCount(row), pct = total ? Math.round(correct / total * 100) : 0;
          return <button className="attempt-row" key={row.id} onClick={() => openAttempt(row)}><span className="attempt-number">{String(history.length - i).padStart(2, '0')}</span><span className="attempt-details"><b>Timed practice · {total} questions</b><small>{stamp(row.finishedAt)}{row.timeExpired ? ' · time expired' : ''}</small></span><span className="attempt-score"><b>{pct}%</b><small>{correct} / {total} correct</small></span><span className="row-arrow">↗</span></button>;
        })}</div>}
      </section>
      <footer className="footer"><span>CCA-F PRACTICE ROOM</span><span>{bank.length} QUESTIONS · SAVED LOCALLY IN YOUR BROWSER</span></footer>
    </main>}

    {page === 'quiz' && session && activeQuestion && <main className="exam-page">
      <div className="exam-topline"><button className="back-link" onClick={() => { saveActive(session); setPage('home'); }}>← Exit to dashboard</button><div className="exam-title"><span className="section-kicker">TIMED MOCK EXAM</span><b>Claude Certified Architect Foundations</b></div><div className={'timer ' + (left < 300 ? 'timer-warn' : '')}><span className="timer-icon">◷</span><span><small>TIME REMAINING</small><b>{fmt(left)}</b></span></div></div>
      <div className="exam-progress"><div className="progress-meta"><span>QUESTION <b>{String(current + 1).padStart(2, '0')}</b> <i>OF</i> {session.questions.length}</span><span>{answered} ANSWERED <i>·</i> {session.marked.length} MARKED</span></div><div className="progress-track"><div style={{ width: ((current + 1) / session.questions.length * 100) + '%' }}/></div></div>
      <div className="exam-layout"><aside className="question-rail"><div className="rail-head"><div><span className="section-kicker">QUESTION MAP</span><b>Navigate the exam</b></div><span>{answered}/{session.questions.length}</span></div><div className="question-grid">{session.questions.map((q, i) => { const id=q.questionHash, isCurrent=i===current, done=!!session.answers[id], marked=session.marked.includes(id); return <button key={id} title={'Question '+(i+1)+(done?' · answered':' · unanswered')+(marked?' · marked':'')} className={'q-number '+(isCurrent?'is-current ':'')+(done?'is-done ':'')+(marked?'is-marked':'')} onClick={() => navigateTo(i)}>{i+1}{marked&&<span className="pin-dot"/>}</button>; })}</div><div className="rail-legend"><span><i className="legend-dot answered-dot"/>Answered</span><span><i className="legend-dot marked-dot"/>Marked</span><span><i className="legend-dot"/>Unanswered</span></div><div className="rail-bottom"><span>Need a second look?</span><button onClick={toggleMark} className={session.marked.includes(activeQuestion.questionHash)?'marked-action':''}>{session.marked.includes(activeQuestion.questionHash)?'◆ Marked for review':'◇ Mark for review'}</button></div></aside>
        <section className="question-panel"><div className="question-meta"><span className="question-index">QUESTION {String(current+1).padStart(2,'0')}</span><span className="question-tag">{(activeQuestion.tags||[]).find(t=>!['score-focus','hunt'].includes(t)) || 'ARCHITECTURE'}</span></div><h1>{activeQuestion.question}</h1><p className="answer-instruction">Select one answer.</p><div className="answer-list">{LETTERS.map(letter => <button key={letter} className={'answer-option '+(selectedKey===letter?'is-selected':'')} onClick={() => answer(letter)}><span className="option-key">{letter}</span><span className="option-text">{activeQuestion.options[letter]}</span><span className="option-check">{selectedKey===letter?'✓':''}</span></button>)}</div><div className="question-controls"><button className="secondary-btn" onClick={() => navigateTo(Math.max(0,current-1))} disabled={current===0}>← Previous</button><button className="next-btn" onClick={() => current===session.questions.length-1?finish(session):navigateTo(current+1)}>{current===session.questions.length-1?'Review & finish':'Next question'} <span>→</span></button></div><div className="autosave-note"><span>✓</span> Answers are saved automatically on this device</div></section>
      </div>
      <div className="exam-footer"><span>DO YOUR BEST WORK. THE REVIEW COMES AFTER.</span><button onClick={() => finish(session)}>Finish test early <span>↗</span></button></div>
    </main>}

    {page === 'review' && session && <main className="review-page wrap">
      <button className="back-link review-back" onClick={returnHome}>← Back to dashboard</button>
      <section className="result-hero"><div><div className="eyebrow"><span className="eyebrow-line"/> EXAM COMPLETE</div><h1>Your review,<br/><em>at a glance.</em></h1><p>{stamp(session.finishedAt)}{session.timeExpired?' · Time expired':''}</p></div><div className="score-card"><span>YOUR SCORE</span><b>{session.questions.length?Math.round(correctCount(session)/session.questions.length*100):0}<small>%</small></b><div className="score-divider"/><div className="score-breakdown"><span><i className="score-dot green-dot"/>{correctCount(session)} correct</span><span><i className="score-dot red-dot"/>{Object.keys(session.answers||{}).length-correctCount(session)} wrong</span><span><i className="score-dot gray-dot"/>{session.questions.length-Object.keys(session.answers||{}).length} unanswered</span></div></div></section>
      <section className="domain-results"><div className="section-kicker">SCORE BY DOMAIN</div>{DOMAIN_WEIGHTS.map(d=>{const qs=session.questions.filter(q=>q.domain===d.name);const got=qs.filter(q=>session.answers[q.questionHash]===q.correctAnswer).length;return <div className="domain-result" key={d.name}><span>{d.name}</span><b>{got} / {qs.length}</b><div className="domain-track"><i style={{width:(qs.length?got/qs.length*100:0)+'%'}}/></div></div>;})}</section>
      <section className="review-section"><div className="review-head"><div><div className="section-kicker">ANSWER REVIEW</div><h2>Learn from every question</h2><p className="muted">Your answer, the correct answer, and the reasoning behind it.</p></div><div className="review-stat"><b>{Object.keys(session.answers||{}).length}<small> / {session.questions.length}</small></b><span>ATTEMPTED</span></div></div>
        <div className="review-tabs">{['All Questions',...(Object.keys(session.answers||{}).length<session.questions.length?['Attempted']:[]),'Correct','Incorrect'].map(tab=>{const n=tab==='All Questions'?session.questions.length:tab==='Attempted'?Object.keys(session.answers||{}).length:tab==='Correct'?correctCount(session):session.questions.filter(q=>session.answers[q.questionHash]&&session.answers[q.questionHash]!==q.correctAnswer).length;return <button key={tab} className={filter===tab?'active-tab':''} onClick={()=>setFilter(tab)}>{tab}<span>{n}</span></button>;})}</div>
        <div className="review-list">{session.questions.map((q,i)=>{
          const mine=session.answers[q.questionHash], correct=mine===q.correctAnswer, state=!mine?'unanswered':correct?'correct':'incorrect';
          const show=filter==='All Questions'||(filter==='Attempted'&&!!mine)||(filter==='Correct'&&correct)||(filter==='Incorrect'&&!!mine&&!correct);
          if(!show)return null;
          return <article className={'review-card '+state} key={q.questionHash}><div className="review-card-top"><span className="review-qnum">QUESTION {String(i+1).padStart(2,'0')}</span><span className={'status-pill '+state}>{!mine?'Unanswered':correct?'Correct':'Incorrect'}</span>{session.marked?.includes(q.questionHash)&&<span className="marked-pill">◆ Marked</span>}</div><h3>{q.question}</h3><div className="review-options">{LETTERS.map(letter=><div key={letter} className={'review-option '+(letter===q.correctAnswer?'right-answer ':'')+(mine===letter&&!correct?'wrong-answer ':'')+(mine===letter?'your-answer':'')}><span className="option-key">{letter}</span><span>{q.options[letter]}</span>{letter===q.correctAnswer&&<b className="answer-label">CORRECT ANSWER</b>}{mine===letter&&<b className="answer-label yours-label">YOUR ANSWER</b>}</div>)}</div><div className="answer-summary"><div><span>YOUR ANSWER</span><b>{mine?mine+'. '+q.options[mine]:'Not answered'}</b></div><div><span>CORRECT ANSWER</span><b>{q.correctAnswer+'. '+q.options[q.correctAnswer]}</b></div></div><div className="explanation"><span className="explanation-icon">✳</span><div><b>Why this is correct</b><p>{q.explanation}</p></div></div></article>;
        })}</div>
        {((filter==='Incorrect'&&session.questions.every(q=>!session.answers[q.questionHash]||session.answers[q.questionHash]===q.correctAnswer))||(filter==='Correct'&&!correctCount(session))||(filter==='Attempted'&&!Object.keys(session.answers||{}).length))&&<div className="empty-filter">Nothing in this group yet. Keep practicing and check back after another attempt.</div>}
      </section>
      <div className="review-end"><button className="primary-btn" onClick={returnHome}>Back to dashboard <span>↗</span></button><button className="outline-btn" onClick={startExam}>Start another test</button></div>
      <footer className="footer"><span>CCA-F PRACTICE ROOM</span><span>YOUR HISTORY IS SAVED LOCALLY WITH INDEXEDDB</span></footer>
    </main>}
  </div>;
}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode, null, React.createElement(App)));
