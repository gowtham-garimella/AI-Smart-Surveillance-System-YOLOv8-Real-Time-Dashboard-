"use client";

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Shield, 
  UploadCloud, 
  Settings, 
  Clock, 
  User, 
  LogOut, 
  AlertTriangle, 
  Video, 
  TrendingUp, 
  FileText,
  Activity,
  Trash2
} from 'lucide-react';

interface LogItem {
  time: string;
  label: string;
  confidence: number;
}

interface Session {
  id: number;
  videoName: string;
  videoUrl: string | null;
  originalVideoPath: string;
  processedVideoPath: string;
  objectCounts: Record<string, number>;
  alerts: string[];
  recentLogs: LogItem[];
  aiExplanation: string;
  createdAt: string;
}

const isImageSession = (session: Session | null) => {
  if (!session) return false;
  const path = session.originalVideoPath.toLowerCase();
  return path.endsWith('.png') || path.endsWith('.jpg') || path.endsWith('.jpeg') || path.endsWith('.webp') || path.endsWith('.bmp');
};

const COCO_GROUPS = [
  {
    name: "People",
    classes: ["person"]
  },
  {
    name: "Vehicles & Transport",
    classes: ["bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat"]
  },
  {
    name: "Outdoor / Road Infrastructure",
    classes: ["traffic light", "fire hydrant", "stop sign", "parking meter", "bench"]
  },
  {
    name: "Animals",
    classes: ["bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe"]
  },
  {
    name: "Personal Items & Accessories",
    classes: ["backpack", "umbrella", "handbag", "tie", "suitcase"]
  },
  {
    name: "Sports & Recreation",
    classes: ["frisbee", "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket"]
  },
  {
    name: "Kitchen & Dining",
    classes: ["bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl"]
  },
  {
    name: "Food Items",
    classes: ["banana", "apple", "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake"]
  },
  {
    name: "Furniture & Decor",
    classes: ["chair", "couch", "potted plant", "bed", "dining table", "toilet", "vase"]
  },
  {
    name: "Electronics & Office",
    classes: ["tv", "laptop", "mouse", "remote", "keyboard", "cell phone", "clock", "book", "scissors"]
  },
  {
    name: "Home Appliances",
    classes: ["microwave", "oven", "toaster", "sink", "refrigerator"]
  },
  {
    name: "Hygiene & Miscellaneous",
    classes: ["teddy bear", "hair drier", "toothbrush"]
  }
];

export default function DashboardPage() {
  const [user, setUser] = useState<{ username: string } | null>(null);
  const [history, setHistory] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [activeTab, setActiveTab] = useState<'monitor' | 'history'>('monitor');
  const router = useRouter();

  // Settings & Form States
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [confidence, setConfidence] = useState(0.5);
  const [frameSkip, setFrameSkip] = useState(2);
  const [selectedAlerts, setSelectedAlerts] = useState<string[]>(['person', 'car']);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    "People": true,
    "Vehicles & Transport": true
  });
  
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState('');

  // Synchronous Playback Control Refs
  const originalVideoRef = useRef<HTMLVideoElement>(null);
  const processedVideoRef = useRef<HTMLVideoElement>(null);

  // Authenticate user & load history
  useEffect(() => {
    async function checkAuthAndLoadData() {
      try {
        const meRes = await fetch('/api/auth/me');
        if (!meRes.ok) {
          router.push('/login');
          return;
        }
        const meData = await meRes.json();
        setUser(meData.user);

        // Fetch history
        const histRes = await fetch('/api/history');
        if (histRes.ok) {
          const histData = await histRes.json();
          setHistory(histData.history || []);
          if (histData.history && histData.history.length > 0) {
            setSelectedSession(histData.history[0]);
          }
        }
      } catch (err) {
        console.error("Dashboard auth check failed:", err);
        router.push('/login');
      }
    }
    checkAuthAndLoadData();
  }, [router]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: number) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this surveillance feed? This will remove all database logs and video files.")) return;

    try {
      const res = await fetch('/api/history', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: sessionId })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete stream.");
      }

      // Update UI list state
      const updatedHistory = history.filter(s => s.id !== sessionId);
      setHistory(updatedHistory);

      // If deleted session was currently selected
      if (selectedSession?.id === sessionId) {
        if (updatedHistory.length > 0) {
          setSelectedSession(updatedHistory[0]);
        } else {
          setSelectedSession(null);
        }
      }
    } catch (err: any) {
      alert(err.message || "An error occurred while deleting the feed.");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setVideoFile(e.target.files[0]);
      setVideoUrl(''); // clear URL input if file is chosen
      setError('');
    }
  };

  const handleAlertCheckboxChange = (alertClass: string) => {
    if (selectedAlerts.includes(alertClass)) {
      setSelectedAlerts(selectedAlerts.filter(a => a !== alertClass));
    } else {
      setSelectedAlerts([...selectedAlerts, alertClass]);
    }
  };

  const handleProcessVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!videoFile && !videoUrl.trim()) {
      setError("Please select a video file or submit a network streaming link.");
      return;
    }

    setLoading(true);
    setLoadingStep("1. Connecting to security mainframe...");
    
    const formData = new FormData();
    if (videoFile) {
      formData.append('videoFile', videoFile);
    } else {
      formData.append('videoUrl', videoUrl);
    }
    formData.append('confidence', confidence.toString());
    formData.append('frameSkip', frameSkip.toString());
    formData.append('alerts', selectedAlerts.join(','));

    try {
      // Simulate visual pipeline steps to wow the user
      setTimeout(() => setLoadingStep("2. Running YOLOv8 surveillance scanning engine..."), 2000);
      setTimeout(() => setLoadingStep("3. Rendering frames & compiling threat logs..."), 5000);
      setTimeout(() => setLoadingStep("4. Engaging Gemini security analyzer..."), 8000);

      const res = await fetch('/api/analyze', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Surveillance scan encountered an error.");
      }

      // Add to list and set active
      const newSession = data.session;
      setHistory(prev => [newSession, ...prev]);
      setSelectedSession(newSession);
      
      // Reset input fields
      setVideoFile(null);
      setVideoUrl('');
      
      // Scroll to result view
      setActiveTab('monitor');
    } catch (err: any) {
      setError(err.message || "Failed to process video session.");
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  // Synchronous Playback Handler
  const handlePlay = () => {
    if (originalVideoRef.current && processedVideoRef.current) {
      originalVideoRef.current.play();
      processedVideoRef.current.play();
    }
  };

  const handlePause = () => {
    if (originalVideoRef.current && processedVideoRef.current) {
      originalVideoRef.current.pause();
      processedVideoRef.current.pause();
    }
  };

  const handleSeek = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    const time = e.currentTarget.currentTime;
    const target = e.currentTarget === originalVideoRef.current ? processedVideoRef.current : originalVideoRef.current;
    if (target && Math.abs(target.currentTime - time) > 0.3) {
      target.currentTime = time;
    }
  };

  return (
    <div className="dashboard-layout">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="sidebar-brand">🛡️ OMNI-SEC</div>
        
        <div className="sidebar-title">Monitoring Feeds</div>
        <div className="history-list">
          {history.map((session) => (
            <div
              key={session.id}
              onClick={() => setSelectedSession(session)}
              className={`history-item ${selectedSession?.id === session.id ? 'active' : ''}`}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
            >
              <div style={{ flex: 1, minWidth: 0, paddingRight: '8px' }}>
                <div className="history-file">{session.videoName}</div>
                <div className="history-meta">
                  <span>{new Date(session.createdAt).toLocaleDateString()}</span>
                  <span style={{ color: session.alerts.length > 0 ? '#ffcc00' : '#00ff66' }}>
                    {session.alerts.length} Warnings
                  </span>
                </div>
              </div>
              <button
                onClick={(e) => handleDeleteSession(e, session.id)}
                className="btn-logout"
                style={{ padding: '6px', color: '#fca5a5', background: 'transparent', border: 'none', display: 'flex', alignItems: 'center' }}
                title="Delete Feed"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          {history.length === 0 && (
            <div style={{ color: '#475569', fontSize: '0.85rem', padding: '10px' }}>
              No recorded streams.
            </div>
          )}
        </div>

        {/* Logged in User Console Footer */}
        {user && (
          <div className="user-profile">
            <div className="user-avatar">
              {user.username.substring(0, 2).toUpperCase()}
            </div>
            <div className="user-info">
              <div className="user-name">{user.username}</div>
              <div style={{ fontSize: '0.72rem', color: '#00ff66', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00ff66', display: 'inline-block' }}></span>
                System Operator
              </div>
            </div>
            <button onClick={handleLogout} className="btn-logout" title="Exit Console">
              <LogOut size={16} />
            </button>
          </div>
        )}
      </aside>

      {/* Main Panel Console */}
      <main className="main-workspace">
        <header className="workspace-header">
          <div>
            <h1 className="workspace-title">AI Video Threat Assessment Console</h1>
            <p style={{ color: '#94a3b8', fontSize: '0.88rem' }}>
              Real-time object recognition pipeline & threat diagnostics.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              className={`auth-tab ${activeTab === 'monitor' ? 'active' : ''}`} 
              style={{ width: '120px', fontSize: '0.85rem' }}
              onClick={() => setActiveTab('monitor')}
            >
              Console Feed
            </button>
            <button 
              className={`auth-tab ${activeTab === 'history' ? 'active' : ''}`}
              style={{ width: '120px', fontSize: '0.85rem' }}
              onClick={() => setActiveTab('history')}
            >
              Queue Stream
            </button>
          </div>
        </header>

        {error && <div className="auth-error">{error}</div>}

        {/* Step Loader Overlay */}
        {loading && (
          <div className="panel-card glass" style={{ padding: '60px 40px', textAlign: 'center', border: '1px solid rgba(0, 255, 102, 0.3)' }}>
            <div className="spinner" style={{ margin: '0 auto 24px auto' }}></div>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '8px', color: '#00ff66' }}>Analyzing Video Sequence</h3>
            <p style={{ color: '#94a3b8', fontFamily: 'monospace', fontSize: '0.9rem' }}>{loadingStep}</p>
          </div>
        )}

        {!loading && activeTab === 'history' && (
          <div className="workspace-grid animate-fade-in">
            {/* Input stream form */}
            <form onSubmit={handleProcessVideo} className="panel-card glass" style={{ gridColumn: '1 / -1' }}>
              <h3 className="panel-title"><Video size={18} color="#00ff66" /> Register New Stream Segment</h3>
              
              <div className="dropzone" onClick={() => document.getElementById('video-upload')?.click()}>
                <UploadCloud size={32} className="dropzone-icon" style={{ margin: '0 auto 12px auto' }} />
                <div className="dropzone-text">
                  {videoFile ? `Selected: ${videoFile.name}` : "Drag & drop file or click to browse local video"}
                </div>
                <div className="dropzone-subtext">Supports MP4, WebM, PNG, JPG (Max 50MB)</div>
                <input
                  type="file"
                  id="video-upload"
                  className="file-input"
                  accept="video/*,image/*"
                  onChange={handleFileChange}
                />
              </div>

              <div style={{ margin: '20px 0', display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }}></div>
                <span style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 'bold', textTransform: 'uppercase' }}>OR</span>
                <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }}></div>
              </div>

              <div className="form-group">
                <label className="form-label">Network Stream / YouTube Link</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Paste direct MP4 URL or YouTube link (e.g. https://www.youtube.com/watch?...)"
                  value={videoUrl}
                  onChange={(e) => {
                    setVideoUrl(e.target.value);
                    setVideoFile(null); // clear file if URL is typed
                  }}
                />
              </div>

              {/* Configurations */}
              <h4 className="sidebar-title" style={{ marginTop: '24px', color: '#bc34fa' }}><Settings size={14} style={{ display: 'inline', marginRight: 4 }} /> Security Threshold Settings</h4>
              <div className="settings-grid">
                <div className="form-group">
                  <label className="form-label">Confidence Gate: {Math.round(confidence * 100)}%</label>
                  <input
                    type="range"
                    min="0.1"
                    max="0.9"
                    step="0.05"
                    style={{ width: '100%', accentColor: '#00ff66' }}
                    value={confidence}
                    onChange={(e) => setConfidence(parseFloat(e.target.value))}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#475569' }}>
                    <span>Sensitive</span>
                    <span>Strict</span>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Frame Skip Rate: {frameSkip}x</label>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    step="1"
                    style={{ width: '100%', accentColor: '#bc34fa' }}
                    value={frameSkip}
                    onChange={(e) => setFrameSkip(parseInt(e.target.value, 10))}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#475569' }}>
                    <span>High Fidelity (1)</span>
                    <span>Fast Process (5)</span>
                  </div>
                </div>
              </div>

              {/* Alert checkbox rules */}
              <div className="form-group" style={{ marginTop: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>Sector Warnings & Alerts</label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ width: 'auto', padding: '6px 12px', fontSize: '0.75rem', background: 'rgba(0, 255, 102, 0.1)', border: '1px solid rgba(0, 255, 102, 0.25)', color: '#00ff66' }}
                      onClick={() => setSelectedAlerts(COCO_GROUPS.flatMap(g => g.classes))}
                    >
                      Select All (80)
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ width: 'auto', padding: '6px 12px', fontSize: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#ef4444' }}
                      onClick={() => setSelectedAlerts([])}
                    >
                      Deselect All
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '400px', overflowY: 'auto', paddingRight: '4px', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '12px', padding: '10px', background: 'rgba(0, 0, 0, 0.2)' }}>
                  {COCO_GROUPS.map(group => {
                    const isExpanded = !!expandedGroups[group.name];
                    const selectedInGroup = group.classes.filter(c => selectedAlerts.includes(c));
                    const allChecked = selectedInGroup.length === group.classes.length;

                    return (
                      <div key={group.name} className="glass" style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', overflow: 'hidden' }}>
                        {/* Accordion Header */}
                        <div 
                          onClick={() => setExpandedGroups(prev => ({ ...prev, [group.name]: !prev[group.name] }))}
                          style={{ 
                            padding: '10px 14px', 
                            background: 'rgba(255,255,255,0.02)', 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center', 
                            cursor: 'pointer',
                            userSelect: 'none'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ 
                              fontSize: '0.65rem', 
                              color: isExpanded ? '#00ff66' : '#94a3b8', 
                              transition: 'transform 0.2s', 
                              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', 
                              display: 'inline-block' 
                            }}>
                              ▶
                            </span>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: selectedInGroup.length > 0 ? '#00ff66' : '#f8fafc' }}>
                              {group.name}
                            </span>
                            <span style={{ fontSize: '0.7rem', color: '#888', background: 'rgba(0,0,0,0.3)', padding: '1px 6px', borderRadius: '4px' }}>
                              {selectedInGroup.length}/{group.classes.length}
                            </span>
                          </div>
                          
                          <button
                            type="button"
                            style={{ 
                              background: 'transparent', 
                              border: 'none', 
                              color: allChecked ? '#ef4444' : '#00ff66', 
                              fontSize: '0.72rem', 
                              cursor: 'pointer',
                              fontWeight: 500
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (allChecked) {
                                setSelectedAlerts(prev => prev.filter(c => !group.classes.includes(c)));
                              } else {
                                const otherSelected = selectedAlerts.filter(c => !group.classes.includes(c));
                                setSelectedAlerts([...otherSelected, ...group.classes]);
                              }
                            }}
                          >
                            {allChecked ? "Uncheck Group" : "Check Group"}
                          </button>
                        </div>
                        
                        {/* Checkbox Grid */}
                        {isExpanded && (
                          <div style={{ 
                            padding: '16px 18px', 
                            background: 'rgba(0,0,0,0.15)', 
                            display: 'grid', 
                            gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', 
                            gap: '12px 16px', 
                            borderTop: '1px solid rgba(255,255,255,0.04)' 
                          }}>
                            {group.classes.map(c => (
                              <label 
                                key={c} 
                                style={{ 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  gap: '10px', 
                                  cursor: 'pointer', 
                                  fontSize: '0.95rem', 
                                  color: selectedAlerts.includes(c) ? '#00ff66' : '#cbd5e1',
                                  fontWeight: 500,
                                  userSelect: 'none'
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedAlerts.includes(c)}
                                  style={{ accentColor: '#00ff66', width: 17, height: 17, cursor: 'pointer' }}
                                  onChange={() => handleAlertCheckboxChange(c)}
                                />
                                <span style={{ textTransform: 'capitalize' }}>{c}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <button type="submit" className="btn-primary" style={{ marginTop: '24px' }}>
                Initiate AI Frame Analysis Sequence
              </button>
            </form>
          </div>
        )}

        {!loading && activeTab === 'monitor' && selectedSession && (
          <div className="workspace-grid animate-fade-in">
            {/* Feeds Card */}
            <div className="panel-card glass" style={{ gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 className="panel-title" style={{ marginBottom: 0 }}><Activity size={18} color="#00ff66" /> Surveillance Telemetry Feed</h3>
                {!isImageSession(selectedSession) && (
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                      onClick={handlePlay} 
                      className="btn-primary" 
                      style={{ width: '90px', padding: '8px 12px', fontSize: '0.8rem', background: 'rgba(0, 255, 102, 0.1)', border: '1px solid rgba(0, 255, 102, 0.25)', color: '#00ff66' }}
                    >
                      Play Sync
                    </button>
                    <button 
                      onClick={handlePause} 
                      className="btn-primary"
                      style={{ width: '90px', padding: '8px 12px', fontSize: '0.8rem', background: 'rgba(188, 52, 250, 0.1)', border: '1px solid rgba(188, 52, 250, 0.25)', color: '#bc34fa' }}
                    >
                      Pause Sync
                    </button>
                  </div>
                )}
              </div>
              
              <div className="feeds-container">
                {/* Column 1 Original Feed */}
                <div>
                  <div className="feed-title">{isImageSession(selectedSession) ? "Capture Scan (Original Image)" : "Raw Stream (Original Input)"}</div>
                  <div className="video-wrapper">
                    {isImageSession(selectedSession) ? (
                      <img 
                        className="video-element" 
                        src={selectedSession.originalVideoPath} 
                        style={{ objectFit: 'contain' }}
                        alt="Original scan"
                      />
                    ) : (
                      <video 
                        ref={originalVideoRef}
                        className="video-element" 
                        src={selectedSession.originalVideoPath} 
                        controls 
                        onSeeked={handleSeek}
                        onPlay={handlePlay}
                        onPause={handlePause}
                      />
                    )}
                  </div>
                </div>

                {/* Column 2 Processed Feed with Laser Scanning Overlay */}
                <div>
                  <div className="feed-title" style={{ color: '#00ff66' }}>AI Vision Grid (YOLOv8 Bounding Boxes)</div>
                  <div className="video-wrapper video-scanner-overlay">
                    {isImageSession(selectedSession) ? (
                      <img 
                        className="video-element" 
                        src={selectedSession.processedVideoPath} 
                        style={{ objectFit: 'contain' }}
                        alt="AI analyzed scan"
                      />
                    ) : (
                      <video 
                        ref={processedVideoRef}
                        className="video-element" 
                        src={selectedSession.processedVideoPath} 
                        controls
                        onSeeked={handleSeek}
                        onPlay={handlePlay}
                        onPause={handlePause}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Left Column Diagnostics (Threat Breakdown) */}
            <div className="panel-card glass" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <h3 className="panel-title"><TrendingUp size={18} color="#bc34fa" /> Object Diagnostic Statistics</h3>
              <p className="panel-subtitle">Total classification breakdown in the feed segment.</p>
              
              <div>
                {Object.keys(selectedSession.objectCounts).map(label => {
                  const count = selectedSession.objectCounts[label];
                  // Set max bounds for visual representation
                  const pct = Math.min(100, (count / 15) * 100);
                  return (
                    <div key={label} className="metric-row">
                      <div className="metric-header">
                        <span style={{ textTransform: 'uppercase' }}>{label}</span>
                        <span style={{ color: '#00ff66' }}>{count} Detections</span>
                      </div>
                      <div className="metric-bar-bg">
                        <div className="metric-bar-fill" style={{ width: `${pct}%` }}></div>
                      </div>
                    </div>
                  );
                })}
                {Object.keys(selectedSession.objectCounts).length === 0 && (
                  <div style={{ color: '#475569', fontSize: '0.9rem', textAlign: 'center', padding: '20px' }}>
                    No objects classified above threshold constraints.
                  </div>
                )}
              </div>

              {/* Log Stream Terminal */}
              <h3 className="panel-title" style={{ marginTop: '20px' }}><Clock size={18} color="#00ff66" /> Terminal Event Stream</h3>
              <div className="terminal-card">
                {selectedSession.recentLogs.map((log, index) => {
                  const isAlert = selectedSession.alerts.some(a => 
                    a.toLowerCase().includes(`unauthorized ${log.label.toLowerCase()}`) || 
                    a.toLowerCase().includes(`alert: ${log.label.toLowerCase()}`) ||
                    a.toLowerCase().includes(`alert: unauthorized ${log.label.toLowerCase()}`)
                  );
                  return (
                    <div key={index} className={`terminal-line ${isAlert ? 'alert' : ''}`}>
                      [{log.time}] {isAlert ? '⚠️ WARNING' : 'ℹ️ DETECTED'}: {log.label.toUpperCase()} found with {Math.round(log.confidence * 100)}% confidence
                    </div>
                  );
                })}
                {selectedSession.recentLogs.length === 0 && (
                  <div className="terminal-empty">No logged system events.</div>
                )}
              </div>
            </div>

            {/* Right Column SOC Report Explanation */}
            <div className="panel-card glass" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <h3 className="panel-title"><FileText size={18} color="#00ff66" /> SOC Incident Threat Report</h3>
              <p className="panel-subtitle">AI Generative Assessment and Security Advisories.</p>

              <div className="ai-report-content">
                {/* Parse Markdown Summary sections */}
                {selectedSession.aiExplanation.split('\n').map((line, idx) => {
                  if (line.startsWith('###') || line.startsWith('####')) {
                    return <h3 key={idx}>{line.replace(/#+\s*/, '')}</h3>;
                  }
                  if (line.startsWith('- ')) {
                    return <li key={idx} style={{ marginLeft: 16 }}>{line.replace(/-\s*/, '')}</li>;
                  }
                  if (line.trim() === '') return <div key={idx} style={{ height: 8 }}></div>;
                  return <p key={idx}>{line}</p>;
                })}
              </div>
            </div>
          </div>
        )}

        {/* Zero-state welcomer screen when database has no records */}
        {!loading && history.length === 0 && (
          <div className="panel-card glass animate-fade-in" style={{ padding: '60px 40px', textAlign: 'center' }}>
            <Shield size={64} color="#00ff66" style={{ margin: '0 auto 20px auto', filter: 'drop-shadow(0 0 15px rgba(0, 255, 102, 0.3))' }} />
            <h2 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>Security Monitor Base Online</h2>
            <p style={{ color: '#94a3b8', maxWidth: '500px', margin: '0 auto 24px auto', fontSize: '0.95rem' }}>
              Initialize the pipeline to detect objects, log timestamps, generate alarms, and produce structural AI security advisor summaries.
            </p>
            <button onClick={() => setActiveTab('history')} className="btn-primary" style={{ width: '200px' }}>
              Register Video Stream
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
