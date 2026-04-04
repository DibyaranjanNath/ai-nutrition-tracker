"use client"

import React, { useState, useMemo, useEffect } from "react";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getApiKey } from "./actions/analyze";
// --- Types ---
interface Meal {
  id: string;
  mealName: string;
  protein: number;
  calories: number;
  carbs: number;
  fats: number;
  insight: string;
  timestamp: string;
}

interface HistoricalDay {
  date: string;
  totalProtein: number;
  totalCalories: number;
}

// --- Icons (Custom SVGs for a Premium Look) ---
const IconCamera = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
);
const IconFlame = ({ className = "" }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>
);
const IconTrendingUp = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><path d="M17 6h6v6"/></svg>
);
const IconTrash = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
);
const IconPlus = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
);

export default function App() {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [history, setHistory] = useState<HistoricalDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [streak, setStreak] = useState(0);
  const [trackMode, setTrackMode] = useState<'meal' | 'day'>('day');
  const [lastAnalysis, setLastAnalysis] = useState<Meal | null>(null);
  const [error, setError] = useState<string | null>(null);

  const PROTEIN_GOAL = 150;
  const CALORIE_GOAL = 2200;

  // --- Initialize App & Check Streak ---
  useEffect(() => {
    const savedMeals = localStorage.getItem("fitness_meals");
    const savedHistory = localStorage.getItem("fitness_history");
    const savedStreak = localStorage.getItem("fitness_streak") || "1";
    const lastDate = localStorage.getItem("fitness_last_date");
    const today = new Date().toDateString();

    if (savedHistory) setHistory(JSON.parse(savedHistory));

    if (lastDate && lastDate !== today) {
      // Roll over logic: Save yesterday to history
      if (savedMeals) {
        const yesterdayMeals: Meal[] = JSON.parse(savedMeals);
        const dailyTotal = yesterdayMeals.reduce((acc, m) => ({
          p: acc.p + m.protein,
          c: acc.c + m.calories
        }), { p: 0, c: 0 });

        if (dailyTotal.c > 0) {
          const newHistory = [{ date: lastDate, totalProtein: dailyTotal.p, totalCalories: dailyTotal.c }, ...(savedHistory ? JSON.parse(savedHistory) : [])];
          setHistory(newHistory.slice(0, 30)); // Keep last 30 days
          localStorage.setItem("fitness_history", JSON.stringify(newHistory));
        }
      }
      
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const newStreak = lastDate === yesterday.toDateString() ? parseInt(savedStreak) + 1 : 1;
      setStreak(newStreak);
      localStorage.setItem("fitness_streak", newStreak.toString());
      localStorage.setItem("fitness_last_date", today);
      setMeals([]); 
    } else {
      setStreak(parseInt(savedStreak));
      if (savedMeals) setMeals(JSON.parse(savedMeals));
      if (!lastDate) localStorage.setItem("fitness_last_date", today);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("fitness_meals", JSON.stringify(meals));
  }, [meals]);

  const totals = useMemo(() => {
    return meals.reduce((acc, m) => ({
      p: acc.p + (m.protein || 0),
      c: acc.c + (m.calories || 0),
      carbs: acc.carbs + (m.carbs || 0),
      f: acc.f + (m.fats || 0)
    }), { p: 0, c: 0, carbs: 0, f: 0 });
  }, [meals]);

  const improvementStats = useMemo(() => {
    if (history.length === 0) return null;
    const avgProtein = history.reduce((sum, day) => sum + day.totalProtein, 0) / history.length;
    const isImproving = totals.p > avgProtein;
    const diff = avgProtein === 0 ? 0 : Math.round(((totals.p - avgProtein) / avgProtein) * 100);
    return { avgProtein: Math.round(avgProtein), daysTracked: history.length, isImproving, diff: Math.abs(diff) };
  }, [history, totals.p]);

  // --- Live AI Logic with Exponential Backoff ---
  const analyzeImage = async (base64: string, type: string, retries = 5, delay = 1000): Promise<any> => {
    const apiKey = await getApiKey();
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    const prompt = `Analyze this food image and provide nutritional estimates. 
    Return ONLY a JSON object with these exact keys:
    { "mealName": "string", "protein": number, "calories": number, "carbs": number, "fats": number, "insight": "One brief fitness tip" }`;

    try {
      const result = await model.generateContent([{ text: prompt }, { inlineData: { data: base64, mimeType: type } }]);
      const response = await result.response;
      const text = response.text();
      // Sanitize JSON response to remove markdown artifacts
      const jsonString = text.replace(/```json|```/g, "").trim();
      return JSON.parse(jsonString);
    } catch (err: any) {
      if (retries > 0 && (err.status === 429 || err.status === 403 || err.message?.includes("fetch"))) {
        await new Promise(r => setTimeout(r, delay));
        return analyzeImage(base64, type, retries - 1, delay * 2);
      }
      throw err;
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    setLastAnalysis(null);

    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(file);
      });

      const data = await analyzeImage(base64, file.type);
      const newMeal = { 
        ...data, 
        id: crypto.randomUUID(), 
        timestamp: new Date().toISOString(),
        // Ensure values are numbers to prevent UI breakage
        protein: Number(data.protein || 0),
        calories: Number(data.calories || 0),
        carbs: Number(data.carbs || 0),
        fats: Number(data.fats || 0)
      };

      if (trackMode === 'day') {
        setMeals(prev => [newMeal, ...prev]);
      } else {
        setLastAnalysis(newMeal);
      }
    } catch (err) {
      console.error("Analysis Error:", err);
      setError("AI was unable to process this image. Please try another shot.");
    } finally {
      setLoading(false);
      if (e.target) e.target.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFDFD] text-[#1A1A1A] pb-32 font-sans selection:bg-blue-100">
      {/* Premium Navigation Header */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100 px-6 py-4">
        <div className="max-w-xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-slate-200">
              <IconFlame />
            </div>
            <span className="font-black text-2xl tracking-tighter uppercase italic">Axon<span className="text-blue-600">.</span></span>
          </div>
          <div className="bg-slate-50 border border-slate-200/60 rounded-2xl px-4 py-2 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
            <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">{streak} Day Streak</span>
          </div>
        </div>
      </nav>

      <main className="max-w-xl mx-auto px-6 py-8 space-y-10">
        
        {/* Track Mode Switcher */}
        <div className="flex bg-slate-100/80 p-1.5 rounded-[1.25rem] border border-slate-200/50">
          <button 
            onClick={() => { setTrackMode('meal'); setLastAnalysis(null); setError(null); }}
            className={`flex-1 py-2.5 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all duration-300 ${trackMode === 'meal' ? 'bg-white shadow-sm text-slate-900 ring-1 ring-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Instant Check
          </button>
          <button 
            onClick={() => { setTrackMode('day'); setError(null); }}
            className={`flex-1 py-2.5 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all duration-300 ${trackMode === 'day' ? 'bg-white shadow-sm text-slate-900 ring-1 ring-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Track Daily Fuel
          </button>
        </div>

        {/* Global Progress Dashboard */}
        {trackMode === 'day' && (
          <div className="grid grid-cols-2 gap-5">
            <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Energy (kcal)</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-4xl font-black tracking-tight">{totals.c}</span>
                <span className="text-slate-300 font-bold text-sm">/ {CALORIE_GOAL}</span>
              </div>
              <div className="mt-4 h-1.5 bg-slate-50 rounded-full overflow-hidden">
                <div className="h-full bg-orange-500 transition-all duration-1000 ease-out" style={{ width: `${Math.min((totals.c / CALORIE_GOAL) * 100, 100)}%` }} />
              </div>
            </div>
            <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Protein (g)</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-4xl font-black tracking-tight text-blue-600">{totals.p}</span>
                <span className="text-slate-300 font-bold text-sm">/ {PROTEIN_GOAL}</span>
              </div>
              <div className="mt-4 h-1.5 bg-slate-50 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600 transition-all duration-1000 ease-out" style={{ width: `${Math.min((totals.p / PROTEIN_GOAL) * 100, 100)}%` }} />
              </div>
            </div>
          </div>
        )}

        {/* Error Messaging */}
        {error && (
          <div className="bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center gap-3 text-red-600 animate-in fade-in zoom-in">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <p className="text-xs font-bold uppercase tracking-wider">{error}</p>
          </div>
        )}

        {/* Analysis Results */}
        {(lastAnalysis || (trackMode === 'day' && meals.length > 0)) && (
          <div className="space-y-6">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                {trackMode === 'meal' ? 'Live Analysis' : 'Fuel Timeline'}
              </h3>
              {trackMode === 'day' && (
                <button onClick={() => confirm("Clear today's logs?") && setMeals([])} className="text-[10px] font-black text-red-400 hover:text-red-500 uppercase tracking-widest transition-colors">Clear All</button>
              )}
            </div>

            <div className="space-y-4">
              {(trackMode === 'meal' ? [lastAnalysis] : meals).map((meal, idx) => meal && (
                <div key={meal.id} className="group bg-white p-7 rounded-[3rem] border border-slate-100 shadow-[0_10px_40px_rgb(0,0,0,0.03)] hover:shadow-[0_15px_50px_rgb(0,0,0,0.06)] transition-all duration-500 animate-in fade-in slide-in-from-bottom-4">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h4 className="text-2xl font-black tracking-tighter text-slate-900 mb-1">{meal.mealName}</h4>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        {new Date(meal.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-2xl font-black text-blue-600">{meal.protein}g</span>
                        <p className="text-[8px] font-black text-slate-300 uppercase tracking-tighter">Protein</p>
                      </div>
                      <button onClick={() => trackMode === 'day' ? setMeals(prev => prev.filter(m => m.id !== meal.id)) : setLastAnalysis(null)} className="p-2.5 bg-slate-50 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all">
                        <IconTrash />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-6">
                    <div className="bg-slate-50/50 px-4 py-3 rounded-2xl border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Calories</p>
                      <p className="text-sm font-black">{meal.calories}</p>
                    </div>
                    <div className="bg-slate-50/50 px-4 py-3 rounded-2xl border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Carbs</p>
                      <p className="text-sm font-black">{meal.carbs}g</p>
                    </div>
                    <div className="bg-slate-50/50 px-4 py-3 rounded-2xl border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Fats</p>
                      <p className="text-sm font-black">{meal.fats}g</p>
                    </div>
                  </div>

                  <div className="bg-blue-50/30 p-5 rounded-[2rem] border border-blue-100/50">
                    <p className="text-sm font-medium text-blue-900/70 italic leading-relaxed">"{meal.insight}"</p>
                  </div>

                  {trackMode === 'meal' && (
                    <button 
                      onClick={() => { 
                        setMeals(prev => [meal, ...prev]); 
                        setTrackMode('day'); 
                        setLastAnalysis(null); 
                      }}
                      className="w-full mt-6 bg-slate-900 text-white py-4 rounded-[1.5rem] font-black text-[11px] uppercase tracking-[0.2em] hover:bg-blue-600 shadow-xl shadow-slate-200 transition-all active:scale-95"
                    >
                      Log to Daily Goals
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Historical Analysis */}
        {improvementStats && trackMode === 'day' && (
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-8 rounded-[3rem] shadow-2xl relative overflow-hidden group">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-all duration-1000" />
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2 opacity-50">
                  <IconTrendingUp />
                  <span className="text-[10px] font-bold uppercase tracking-[0.3em]">Performance Insight</span>
                </div>
                <h3 className="text-2xl font-black tracking-tight leading-none">
                  {improvementStats.isImproving ? 'Efficiency Boost' : 'Base Consistency'}
                </h3>
                <p className="text-xs text-slate-400 font-medium leading-relaxed max-w-[280px]">
                  You are {improvementStats.isImproving ? 'exceeding' : 'tracking near'} your {improvementStats.daysTracked}-day protein average by <span className="text-blue-400 font-bold">{improvementStats.diff}%</span>.
                </p>
              </div>
              <div className="flex flex-col items-end">
                <div className={`text-5xl font-black tracking-tighter ${improvementStats.isImproving ? 'text-emerald-400' : 'text-blue-400'}`}>
                  {improvementStats.isImproving ? '↑' : '•'}
                </div>
                <span className="text-[10px] font-black uppercase opacity-40 mt-1 tracking-widest">Growth</span>
              </div>
            </div>
          </div>
        )}

        {/* Floating Scanner Action */}
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-xl px-6 z-40">
          <label className={`relative flex items-center justify-center w-full h-20 rounded-[2.5rem] border-2 border-slate-900 bg-white shadow-2xl shadow-slate-200 cursor-pointer transition-all active:scale-95 group overflow-hidden ${loading ? 'pointer-events-none grayscale' : ''}`}>
            {loading ? (
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-[3px] border-slate-900 border-t-transparent rounded-full animate-spin" />
                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-900">Neural Syncing...</span>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="bg-slate-900 text-white p-3 rounded-2xl group-hover:bg-blue-600 transition-colors">
                  <IconCamera />
                </div>
                <div className="text-left">
                  <p className="font-black text-sm tracking-tight leading-none mb-1 text-slate-900 uppercase tracking-widest">
                    {trackMode === 'meal' ? 'New Scan' : 'Log Entry'}
                  </p>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em]">Vision v2.5 Active</p>
                </div>
              </div>
            )}
            <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={loading} />
          </label>
        </div>

        {/* Empty States */}
        {trackMode === 'day' && meals.length === 0 && (
          <div className="py-20 text-center space-y-4">
            <div className="w-16 h-16 bg-slate-50 rounded-[2rem] flex items-center justify-center mx-auto text-slate-200">
               <IconPlus />
            </div>
            <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">No intake recorded yet</p>
          </div>
        )}

      </main>
    </div>
  );
}