import React, { useState, useMemo } from 'react';

// The 27 CBI Profiles - Robert's actual mappings
const PROFILES = {
  // Concrete + Past
  SHARP: { spatial: [0, 33], temporal: [0, 33], reference: [67, 100],
    description: "Concrete • Past • Self" },
  SEASONED: { spatial: [0, 33], temporal: [0, 33], reference: [34, 66],
    description: "Concrete • Past • Balanced" },
  LEGACY: { spatial: [0, 33], temporal: [0, 33], reference: [0, 33],
    description: "Concrete • Past • Other" },
  
  // Concrete + Present
  EMBODIED: { spatial: [0, 33], temporal: [34, 66], reference: [67, 100],
    description: "Concrete • Present • Self" },
  GROUNDED: { spatial: [0, 33], temporal: [34, 66], reference: [34, 66],
    description: "Concrete • Present • Balanced" },
  ATTUNED: { spatial: [0, 33], temporal: [34, 66], reference: [0, 33],
    description: "Concrete • Present • Other" },
  
  // Concrete + Future
  INTENTIONAL: { spatial: [0, 33], temporal: [67, 100], reference: [67, 100],
    description: "Concrete • Future • Self" },
  RESILIENT: { spatial: [0, 33], temporal: [67, 100], reference: [34, 66],
    description: "Concrete • Future • Balanced" },
  RELIABLE: { spatial: [0, 33], temporal: [67, 100], reference: [0, 33],
    description: "Concrete • Future • Other" },
  
  // Balanced + Past
  INTEGRATED: { spatial: [34, 66], temporal: [0, 33], reference: [67, 100],
    description: "Balanced • Past • Self" },
  COHERENT: { spatial: [34, 66], temporal: [0, 33], reference: [34, 66],
    description: "Balanced • Past • Balanced" },
  RECONCILED: { spatial: [34, 66], temporal: [0, 33], reference: [0, 33],
    description: "Balanced • Past • Other" },
  
  // Balanced + Present
  CENTERED: { spatial: [34, 66], temporal: [34, 66], reference: [67, 100],
    description: "Balanced • Present • Self" },
  EQUANIMOUS: { spatial: [34, 66], temporal: [34, 66], reference: [34, 66],
    description: "Balanced • Present • Balanced" },
  EMPATHETIC: { spatial: [34, 66], temporal: [34, 66], reference: [0, 33],
    description: "Balanced • Present • Other" },
  
  // Balanced + Future
  ACTUALIZED: { spatial: [34, 66], temporal: [67, 100], reference: [67, 100],
    description: "Balanced • Future • Self" },
  HARMONIOUS: { spatial: [34, 66], temporal: [67, 100], reference: [34, 66],
    description: "Balanced • Future • Balanced" },
  COLLABORATIVE: { spatial: [34, 66], temporal: [67, 100], reference: [0, 33],
    description: "Balanced • Future • Other" },
  
  // Abstract + Past
  SENTIMENTAL: { spatial: [67, 100], temporal: [0, 33], reference: [67, 100],
    description: "Abstract • Past • Self" },
  REFLECTIVE: { spatial: [67, 100], temporal: [0, 33], reference: [34, 66],
    description: "Abstract • Past • Balanced" },
  IDEALIZED: { spatial: [67, 100], temporal: [0, 33], reference: [0, 33],
    description: "Abstract • Past • Other" },
  
  // Abstract + Present
  INTROSPECTIVE: { spatial: [67, 100], temporal: [34, 66], reference: [67, 100],
    description: "Abstract • Present • Self" },
  MINDFUL: { spatial: [67, 100], temporal: [34, 66], reference: [34, 66],
    description: "Abstract • Present • Balanced" },
  INTUITIVE: { spatial: [67, 100], temporal: [34, 66], reference: [0, 33],
    description: "Abstract • Present • Other" },
  
  // Abstract + Future
  VISIONARY: { spatial: [67, 100], temporal: [67, 100], reference: [67, 100],
    description: "Abstract • Future • Self" },
  FORESIGHTED: { spatial: [67, 100], temporal: [67, 100], reference: [34, 66],
    description: "Abstract • Future • Balanced" },
  ALTRUISTIC: { spatial: [67, 100], temporal: [67, 100], reference: [0, 33],
    description: "Abstract • Future • Other" },
};

// Gradient labels
const GRADIENT_LABELS = {
  spatial: { low: "Concrete", mid: "Balanced", high: "Abstract" },
  temporal: { low: "Past", mid: "Present", high: "Future" },
  reference: { low: "Other", mid: "Balanced", high: "Self" }
};

// Claude Sonnet 4 pricing (USD per million tokens)
const PRICING = {
  inputPerMTok: 3,
  outputPerMTok: 15,
};

// Rough token estimate: ~4 chars/token for English prose.
const estimateTokens = (text) => Math.ceil((text || '').length / 4);

const formatCost = (usd) => {
  if (usd < 0.01) return `<$0.01`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
};

const costFor = (inputTokens, outputTokens) =>
  (inputTokens / 1_000_000) * PRICING.inputPerMTok +
  (outputTokens / 1_000_000) * PRICING.outputPerMTok;

function CognitiveModifier() {
  const [spatial, setSpatial] = useState(50);
  const [temporal, setTemporal] = useState(50);
  const [reference, setReference] = useState(50);
  const [inputText, setInputText] = useState('');
  const [modifiedText, setModifiedText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [changes, setChanges] = useState([]);
  const [error, setError] = useState('');
  const [lastUsage, setLastUsage] = useState(null);
  const [sessionUsage, setSessionUsage] = useState({ inputTokens: 0, outputTokens: 0, calls: 0 });

  // Find matching profile
  const matchedProfile = useMemo(() => {
    for (const [name, config] of Object.entries(PROFILES)) {
      const spatialMatch = spatial >= config.spatial[0] && spatial <= config.spatial[1];
      const temporalMatch = temporal >= config.temporal[0] && temporal <= config.temporal[1];
      const referenceMatch = reference >= config.reference[0] && reference <= config.reference[1];
      
      if (spatialMatch && temporalMatch && referenceMatch) {
        return { name, ...config };
      }
    }
    return null;
  }, [spatial, temporal, reference]);

  const getPositionLabel = (value, gradient) => {
    const labels = GRADIENT_LABELS[gradient];
    if (value <= 33) return labels.low;
    if (value <= 66) return labels.mid;
    return labels.high;
  };

  const getProfileColor = (name) => {
    const profile = PROFILES[name];
    if (!profile) return '#666';
    if (profile.spatial[1] <= 33) return '#22c55e';
    if (profile.spatial[0] >= 67) return '#a855f7';
    return '#3b82f6';
  };

  // Build the transformation prompt
  const buildTransformationPrompt = (content, targetProfile, spatialScore, temporalScore, referenceScore) => {
    const spatialLabel = getPositionLabel(spatialScore, 'spatial');
    const temporalLabel = getPositionLabel(temporalScore, 'temporal');
    const referenceLabel = getPositionLabel(referenceScore, 'reference');
    
    return `You are a Cognitive Architecture Information Modifier. Transform the following content to optimize it for a reader with this cognitive profile:

TARGET PROFILE: ${targetProfile}
- Spatial Processing: ${spatialLabel} (${spatialScore}/100)
- Temporal Processing: ${temporalLabel} (${temporalScore}/100)  
- Reference Processing: ${referenceLabel} (${referenceScore}/100)

TRANSFORMATION RULES:

${spatialScore <= 33 ? `CONCRETE PROCESSING (Spatial ${spatialScore}):
- Lead with specific examples BEFORE explaining principles
- Use bullet points and numbered lists extensively
- Replace abstract vocabulary with common, everyday words
- Add sensory-grounded descriptions
- Break complex sentences into shorter ones
- Include "for example," "such as," "like this"
- Convert percentages to real numbers (e.g., "73%" → "73 out of 100")
- Add visual progress indicators where applicable
- Remove or simplify jargon` : ''}

${spatialScore >= 67 ? `ABSTRACT PROCESSING (Spatial ${spatialScore}):
- Lead with principles and frameworks BEFORE examples
- Consolidate bullet points into flowing prose
- Use technical/sophisticated vocabulary
- Focus on underlying patterns and structures
- Combine related ideas into unified concepts
- Remove redundant examples
- Use terms like "framework," "paradigm," "methodology"` : ''}

${temporalScore <= 33 ? `PAST-ORIENTED PROCESSING (Temporal ${temporalScore}):
- Frame everything through historical precedent and proven results
- Add "This has been proven by..." "Historically..." "Case studies show..."
- Emphasize what HAS worked, not what MIGHT work
- Replace future tense with past validation
- Include established patterns and proven methods
- Reference prior success stories and track records
- Use words like "established," "proven," "validated," "demonstrated"
- Remove speculative language` : ''}

${temporalScore >= 67 ? `FUTURE-ORIENTED PROCESSING (Temporal ${temporalScore}):
- Frame everything through possibility and potential
- Add "This could lead to..." "Imagine..." "The implications are..."
- Emphasize what MIGHT happen, emerging trends
- Replace past tense with future projection
- Include speculation and innovation opportunities
- Use words like "potential," "emerging," "could," "will," "future"` : ''}

${referenceScore <= 33 ? `OTHER-ORIENTED PROCESSING (Reference ${referenceScore}):
- Frame ALL benefits for the group/team/community
- Use "we," "our," "the team," "everyone," "together"
- Add collaboration prompts and sharing suggestions
- Emphasize collective benefit over individual gain
- Include "Share this with..." "Discuss with your team..."
- Frame motivation through helping others and group success
- Remove self-focused language` : ''}

${referenceScore >= 67 ? `SELF-ORIENTED PROCESSING (Reference ${referenceScore}):
- Frame ALL benefits for the individual personally
- Use "you," "your," "I," "my," "personal"
- Add reflection questions and self-application prompts
- Emphasize personal relevance and individual benefit
- Include "Ask yourself..." "For your situation..." "What this means for you..."
- Frame motivation through personal growth/gain
- Remove collective language` : ''}

CONTENT TO TRANSFORM:
---
${content}
---

Transform this content completely for the target cognitive profile. Maintain all factual information but restructure, reframe, and rephrase everything to match how this reader naturally processes information.

Output ONLY the transformed content, no explanations or meta-commentary.`;
  };

  // Estimated cost for the next transform (live, before API call)
  const estimatedCost = useMemo(() => {
    if (!inputText.trim()) return null;
    const prompt = buildTransformationPrompt(
      inputText,
      'PREVIEW',
      spatial,
      temporal,
      reference
    );
    const inputTokens = estimateTokens(prompt);
    // Output tokens roughly track input content length; transforms reframe, not summarize.
    const outputTokens = Math.min(estimateTokens(inputText), 8192);
    return {
      inputTokens,
      outputTokens,
      usd: costFor(inputTokens, outputTokens),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputText, spatial, temporal, reference]);

  // Call Claude API
  const transformWithAPI = async () => {
    if (!inputText.trim()) {
      setError('Please enter content to transform');
      return;
    }
    
    if (!apiKey.trim()) {
      setError('Please enter your Anthropic API key');
      return;
    }

    setIsLoading(true);
    setError('');
    setChanges([]);

    const prompt = buildTransformationPrompt(
      inputText,
      matchedProfile?.name || 'Unknown',
      spatial,
      temporal,
      reference
    );

    try {
      const response = await fetch('/api/anthropic', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 8192,
          messages: [
            { role: 'user', content: prompt }
          ]
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `API error: ${response.status}`);
      }

      const data = await response.json();
      const transformedContent = data.content[0].text;
      const usage = data.usage || {};
      const inputTokens = usage.input_tokens || 0;
      const outputTokens = usage.output_tokens || 0;
      const usd = costFor(inputTokens, outputTokens);

      setModifiedText(transformedContent);
      setLastUsage({ inputTokens, outputTokens, usd });
      setSessionUsage((prev) => ({
        inputTokens: prev.inputTokens + inputTokens,
        outputTokens: prev.outputTokens + outputTokens,
        calls: prev.calls + 1,
      }));
      setChanges([
        `Transformed for ${matchedProfile?.name || 'target'} profile`,
        `Spatial: ${getPositionLabel(spatial, 'spatial')} (${spatial})`,
        `Temporal: ${getPositionLabel(temporal, 'temporal')} (${temporal})`,
        `Reference: ${getPositionLabel(reference, 'reference')} (${reference})`
      ]);

    } catch (err) {
      console.error('API Error:', err);
      if (err.message === 'Failed to fetch') {
        setError('Failed to fetch: This is likely a CORS issue. Make sure your API key has "browser access" enabled at console.anthropic.com/settings/keys');
      } else {
        setError(err.message || 'Failed to transform content');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const SliderControl = ({ label, value, onChange, gradient }) => (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ fontWeight: '500' }}>{label}</span>
        <span style={{ fontWeight: 'bold' }}>
          {value} - {getPositionLabel(value, gradient)}
        </span>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        style={{ width: '100%', cursor: 'pointer' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#666', marginTop: '4px' }}>
        <span>{GRADIENT_LABELS[gradient].low}</span>
        <span>{GRADIENT_LABELS[gradient].mid}</span>
        <span>{GRADIENT_LABELS[gradient].high}</span>
      </div>
    </div>
  );

  return (
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: '#1a1a2e', 
      color: 'white', 
      padding: '20px',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <h1 style={{ textAlign: 'center', marginBottom: '8px', fontSize: '28px' }}>
          Cognitive Architecture Modifier
        </h1>
        <p style={{ textAlign: 'center', color: '#888', marginBottom: '30px' }}>
          AI-Powered Content Transformation for Any Cognitive Profile
        </p>
        
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr 1fr', gap: '20px' }}>
          
          {/* Controls Panel */}
          <div style={{ backgroundColor: '#252540', borderRadius: '12px', padding: '20px' }}>
            <h2 style={{ fontSize: '18px', marginBottom: '20px' }}>Target Profile</h2>
            
            {/* API Key Input */}
            <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#1a1a2e', borderRadius: '8px' }}>
              <label style={{ fontSize: '12px', color: '#888', display: 'block', marginBottom: '8px' }}>
                Anthropic API Key
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                  style={{
                    flex: 1,
                    padding: '8px',
                    backgroundColor: '#333',
                    border: '1px solid #444',
                    borderRadius: '4px',
                    color: 'white',
                    fontSize: '12px'
                  }}
                />
                <button
                  onClick={() => setShowApiKey(!showApiKey)}
                  style={{
                    padding: '8px',
                    backgroundColor: '#444',
                    border: 'none',
                    borderRadius: '4px',
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  {showApiKey ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            
            <SliderControl 
              label="Spatial" 
              value={spatial} 
              onChange={setSpatial}
              gradient="spatial"
            />
            
            <SliderControl 
              label="Temporal" 
              value={temporal} 
              onChange={setTemporal}
              gradient="temporal"
            />
            
            <SliderControl 
              label="Reference" 
              value={reference} 
              onChange={setReference}
              gradient="reference"
            />
            
            {/* Matched Profile */}
            {matchedProfile && (
              <div style={{ 
                marginTop: '20px', 
                padding: '15px', 
                borderRadius: '8px',
                border: `2px solid ${getProfileColor(matchedProfile.name)}`,
                backgroundColor: `${getProfileColor(matchedProfile.name)}20`
              }}>
                <div style={{ fontSize: '12px', color: '#888' }}>Target Profile</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: getProfileColor(matchedProfile.name) }}>
                  {matchedProfile.name}
                </div>
                <div style={{ fontSize: '12px', color: '#aaa', marginTop: '8px' }}>
                  {matchedProfile.description}
                </div>
              </div>
            )}
            
            {/* Quick Profile Buttons */}
            <div style={{ marginTop: '20px' }}>
              <div style={{ fontSize: '12px', color: '#888', marginBottom: '10px' }}>Quick Select</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {['VISIONARY', 'SHARP', 'GROUNDED', 'LEGACY', 'ALTRUISTIC', 'ATTUNED', 'INTROSPECTIVE'].map(name => (
                  <button
                    key={name}
                    onClick={() => {
                      const p = PROFILES[name];
                      setSpatial(Math.round((p.spatial[0] + p.spatial[1]) / 2));
                      setTemporal(Math.round((p.temporal[0] + p.temporal[1]) / 2));
                      setReference(Math.round((p.reference[0] + p.reference[1]) / 2));
                    }}
                    style={{
                      padding: '6px 10px',
                      fontSize: '11px',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      backgroundColor: matchedProfile?.name === name ? getProfileColor(name) : '#333',
                      color: 'white'
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Cost Estimate */}
            <div style={{ marginTop: '20px', padding: '12px', backgroundColor: '#1a1a2e', borderRadius: '8px', fontSize: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888', marginBottom: '6px' }}>
                <span>Estimated cost (this run)</span>
                <span style={{ color: estimatedCost ? '#fbbf24' : '#555', fontWeight: 'bold' }}>
                  {estimatedCost ? formatCost(estimatedCost.usd) : '—'}
                </span>
              </div>
              {estimatedCost && (
                <div style={{ color: '#666', fontSize: '11px' }}>
                  ~{estimatedCost.inputTokens.toLocaleString()} in / ~{estimatedCost.outputTokens.toLocaleString()} out tokens
                </div>
              )}
              {lastUsage && (
                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #333' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888' }}>
                    <span>Last actual</span>
                    <span style={{ color: '#66bb6a', fontWeight: 'bold' }}>{formatCost(lastUsage.usd)}</span>
                  </div>
                  <div style={{ color: '#666', fontSize: '11px' }}>
                    {lastUsage.inputTokens.toLocaleString()} in / {lastUsage.outputTokens.toLocaleString()} out tokens
                  </div>
                </div>
              )}
              {sessionUsage.calls > 0 && (
                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #333' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888' }}>
                    <span>Session ({sessionUsage.calls} {sessionUsage.calls === 1 ? 'call' : 'calls'})</span>
                    <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>
                      {formatCost(costFor(sessionUsage.inputTokens, sessionUsage.outputTokens))}
                    </span>
                  </div>
                  <div style={{ color: '#666', fontSize: '11px' }}>
                    {sessionUsage.inputTokens.toLocaleString()} in / {sessionUsage.outputTokens.toLocaleString()} out tokens
                  </div>
                </div>
              )}
              <div style={{ marginTop: '8px', color: '#555', fontSize: '10px' }}>
                Sonnet 4: ${PRICING.inputPerMTok}/M in · ${PRICING.outputPerMTok}/M out
              </div>
            </div>

            {/* Transform Button */}
            <button
              onClick={transformWithAPI}
              disabled={isLoading || !inputText.trim() || !apiKey.trim()}
              style={{
                width: '100%',
                marginTop: '20px',
                padding: '15px',
                backgroundColor: isLoading ? '#444' : (matchedProfile ? getProfileColor(matchedProfile.name) : '#3b82f6'),
                border: 'none',
                borderRadius: '8px',
                color: 'white',
                cursor: isLoading ? 'wait' : 'pointer',
                fontSize: '16px',
                fontWeight: 'bold'
              }}
            >
              {isLoading ? 'Transforming...' : `Transform for ${matchedProfile?.name || 'Target'}`}
            </button>
            
            {/* Error Display */}
            {error && (
              <div style={{ 
                marginTop: '15px', 
                padding: '10px', 
                backgroundColor: '#ff000030', 
                borderRadius: '6px',
                border: '1px solid #ff0000',
                fontSize: '12px',
                color: '#ff6666'
              }}>
                {error}
              </div>
            )}
            
            {/* Changes Log */}
            {changes.length > 0 && (
              <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#1a1a2e', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>
                  Transformation Applied
                </div>
                {changes.map((change, i) => (
                  <div key={i} style={{ fontSize: '11px', color: '#66bb6a', marginBottom: '4px' }}>
                    • {change}
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Input Panel */}
          <div style={{ backgroundColor: '#252540', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ fontSize: '18px', marginBottom: '15px' }}>Original Content</h2>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Paste your content here...

Example: Paste a VISIONARY profile, then click SHARP and hit Transform to see it converted for a Concrete • Past • Self reader."
              style={{
                flex: 1,
                minHeight: '500px',
                padding: '15px',
                backgroundColor: '#1a1a2e',
                border: '1px solid #333',
                borderRadius: '8px',
                color: 'white',
                fontSize: '14px',
                lineHeight: '1.6',
                resize: 'none',
                fontFamily: 'inherit'
              }}
            />
          </div>
          
          {/* Output Panel */}
          <div style={{ backgroundColor: '#252540', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h2 style={{ fontSize: '18px', margin: 0 }}>Modified for {matchedProfile?.name || 'Target'}</h2>
            </div>
            <div
              style={{
                flex: 1,
                minHeight: '500px',
                padding: '15px',
                backgroundColor: '#1a1a2e',
                border: `1px solid ${getProfileColor(matchedProfile?.name)}40`,
                borderRadius: '8px',
                color: 'white',
                fontSize: '14px',
                lineHeight: '1.6',
                overflow: 'auto',
                whiteSpace: 'pre-wrap'
              }}
            >
              {isLoading ? (
                <div style={{ color: '#888', textAlign: 'center', marginTop: '50px' }}>
                  <div style={{ fontSize: '24px', marginBottom: '10px' }}>⏳</div>
                  Transforming content for {matchedProfile?.name}...
                </div>
              ) : (
                modifiedText || 'Transformed content will appear here after you click Transform...'
              )}
            </div>
            <div style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
              <button
                onClick={() => navigator.clipboard.writeText(modifiedText)}
                disabled={!modifiedText}
                style={{
                  padding: '10px 20px',
                  backgroundColor: modifiedText ? getProfileColor(matchedProfile?.name) : '#333',
                  border: 'none',
                  borderRadius: '6px',
                  color: 'white',
                  cursor: modifiedText ? 'pointer' : 'not-allowed',
                  fontSize: '14px'
                }}
              >
                Copy Modified Text
              </button>
            </div>
          </div>
        </div>
        
        {/* Profile Grid */}
        <div style={{ marginTop: '30px', backgroundColor: '#252540', borderRadius: '12px', padding: '20px' }}>
          <h2 style={{ fontSize: '18px', marginBottom: '15px' }}>All 27 Profiles</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '8px' }}>
            {Object.entries(PROFILES).map(([name, config]) => {
              const isActive = matchedProfile?.name === name;
              return (
                <button
                  key={name}
                  onClick={() => {
                    setSpatial(Math.round((config.spatial[0] + config.spatial[1]) / 2));
                    setTemporal(Math.round((config.temporal[0] + config.temporal[1]) / 2));
                    setReference(Math.round((config.reference[0] + config.reference[1]) / 2));
                  }}
                  style={{
                    padding: '8px 4px',
                    fontSize: '10px',
                    border: isActive ? '2px solid white' : 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    backgroundColor: isActive ? getProfileColor(name) : `${getProfileColor(name)}40`,
                    color: 'white',
                    opacity: isActive ? 1 : 0.7
                  }}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CognitiveModifier;