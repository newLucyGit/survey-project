import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

const API = 'http://localhost:5000/api';

function SurveyTaking() {
  const { token } = useParams();
  
  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [authenticating, setAuthenticating] = useState(false);
  
  // Survey state
  const [survey, setSurvey] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [responses, setResponses] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [allowedTypes, setAllowedTypes] = useState([]);
  const [selectingType, setSelectingType] = useState(false);
  // Flat model: no subject selection; feedback type is chosen directly

  useEffect(() => {
    // Initial load - just validate token exists, don't fetch full survey yet
    validateToken();
  }, [token]);

  const validateToken = async () => {
    setLoading(true);
    setError('');
    
    try {
      // Just check if token is valid and survey exists
      const response = await axios.get(`${API}/validate-survey-token/${token}`);
      setSurvey({
        title: response.data.title,
        description: response.data.description
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid survey link or survey no longer available.');
    } finally {
      setLoading(false);
    }
  };

  const handleAuthentication = async (e) => {
    e.preventDefault();
    setAuthenticating(true);
    setError('');

    try {
  const response = await axios.post(`${API}/authenticate-survey-participant`, {
        survey_token: token,
        email: email.trim(),
        auth_code: authCode.trim().toUpperCase()
      });

      // If multiple feedback types are allowed and none chosen yet
      if (!response.data.questions && Array.isArray(response.data.allowed_feedback_types)) {
        setSurvey(response.data.survey);
        setAllowedTypes(response.data.allowed_feedback_types);
        setSelectingType(true);
        return;
      }

  // If authentication successful with questions
      setSurvey(response.data.survey);
      setQuestions(response.data.questions || []);
      const initialResponses = {};
      response.data.questions?.forEach(q => {
        initialResponses[q.id] = '';
      });
      setResponses(initialResponses);
      setIsAuthenticated(true);
      
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid email or authorization code. Please check your credentials.');
    } finally {
      setAuthenticating(false);
    }
  };

  const chooseFeedbackType = async (ft) => {
    setAuthenticating(true);
    setError('');
    try {
      const response = await axios.post(`${API}/authenticate-survey-participant`, {
        survey_token: token,
        email: email.trim(),
        auth_code: authCode.trim().toUpperCase(),
        selected_feedback_type: ft
      });
      // Ensure survey includes the chosen feedback type
      const nextSurvey = {
        ...response.data.survey,
        feedback_type: response.data.survey?.feedback_type || ft
      };
      setSurvey(nextSurvey);
      setQuestions(response.data.questions || []);
      const initialResponses = {};
      response.data.questions?.forEach(q => { initialResponses[q.id] = ''; });
      setResponses(initialResponses);
      setIsAuthenticated(true);
      setSelectingType(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to load questions for the selected role.');
    } finally {
      setAuthenticating(false);
    }
  };

  const handleResponseChange = (questionId, value) => {
    setResponses(prev => ({
      ...prev,
      [questionId]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      // Validate required responses
      const unansweredRequired = questions.filter(q => 
        q.is_required && (!responses[q.id] || responses[q.id].trim() === '')
      );

      if (unansweredRequired.length > 0) {
        setError(`Please answer all required questions. Missing: ${unansweredRequired.map(q => q.question_text).join(', ')}`);
        setSubmitting(false);
        return;
      }

      const submissionData = {
        survey_token: token,
        employee_email: email,
        auth_code: authCode,
        feedback_type: survey?.feedback_type,
        responses: questions.map(q => ({
          question_id: q.id,
          response_text: responses[q.id] || '',
          question_type: q.question_type
  }))
      };

      await axios.post(`${API}/survey-responses`, submissionData);
      setSubmitted(true);
      
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit survey. Please try again.');
      setSubmitting(false);
    }
  };

  const nextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const prevQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const goToQuestion = (index) => {
    setCurrentQuestionIndex(index);
  };

  if (loading) {
    return (
      <div className="app-container">
        <div style={{ textAlign: 'center', padding: '4rem' }}>
          <div className="loading">⏳ Loading survey...</div>
        </div>
      </div>
    );
  }

  if (error && !survey) {
    return (
      <div className="app-container">
        <div style={{ textAlign: 'center', padding: '4rem' }}>
          <div className="alert alert-error">{error}</div>
          <p style={{ marginTop: '2rem', color: 'var(--on-surface-variant)' }}>
            Please check the survey link or contact the survey administrator.
          </p>
        </div>
      </div>
    );
  }

  // Show authentication form if not authenticated or role selection pending
  if (survey && !isAuthenticated) {
    return (
      <div className="app-container">
        <div style={{ maxWidth: '500px', margin: '4rem auto', padding: '2rem 1rem' }}>
          <div className="card">
            <div className="card-header" style={{ textAlign: 'center' }}>
              <h1 className="card-title">🔐 Survey Access</h1>
              <p style={{ color: 'var(--on-surface-variant)', margin: '1rem 0 0 0' }}>
                Please verify your identity to access this survey
              </p>
            </div>
            
            <div className="card-content">
              <div style={{ 
                background: 'var(--surface-variant)', 
                padding: 'var(--space-md)', 
                borderRadius: 'var(--radius-md)',
                marginBottom: 'var(--space-lg)',
                textAlign: 'center'
              }}>
                <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--primary)' }}>
                  📋 {survey.title}
                </h3>
                <p style={{ color: 'var(--on-surface-variant)', margin: 0 }}>
                  You may be eligible for one or more roles in this survey.
                </p>
              </div>

              {!selectingType ? (
                <form onSubmit={handleAuthentication}>
                  <div className="form-field">
                    <label className="form-label">
                      📧 Email Address <span style={{ color: 'var(--error)' }}>*</span>
                    </label>
                    <input
                      type="email"
                      placeholder="Enter your email address"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      style={{ fontSize: '1rem' }}
                    />
                    <p style={{ fontSize: '0.875rem', color: 'var(--on-surface-variant)', margin: '0.25rem 0 0 0' }}>
                      Use the email address where you received the survey invitation
                    </p>
                  </div>

                  <div className="form-field">
                    <label className="form-label">
                      🔑 Authorization Code <span style={{ color: 'var(--error)' }}>*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Enter your 8-character code"
                      value={authCode}
                      onChange={(e) => setAuthCode(e.target.value.toUpperCase())}
                      required
                      maxLength={8}
                      style={{ 
                        fontSize: '1.125rem', 
                        fontFamily: 'monospace',
                        letterSpacing: '0.1em',
                        textAlign: 'center'
                      }}
                    />
                    <p style={{ fontSize: '0.875rem', color: 'var(--on-surface-variant)', margin: '0.25rem 0 0 0' }}>
                      8-character code provided by your organization
                    </p>
                  </div>

                  {error && (
                    <div className="alert alert-error" style={{ margin: 'var(--space-md) 0' }}>
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={authenticating || !email.trim() || !authCode.trim()}
                    style={{ width: '100%', marginTop: 'var(--space-md)' }}
                  >
                    {authenticating ? '🔄 Verifying...' : '🚀 Access Survey'}
                  </button>
                </form>
              ) : selectingType ? (
                <div>
                  <div className="alert alert-info" style={{ marginBottom: 'var(--space-md)' }}>
                    You are eligible to give feedback in multiple roles. Please select one to continue.
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {allowedTypes.map((ft) => (
                      <button
                        key={ft}
                        className="btn btn-outline"
                        onClick={() => chooseFeedbackType(ft)}
                        disabled={authenticating}
                        style={{ textTransform: 'capitalize' }}
                      >
                        {ft}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              
              <div style={{ 
                marginTop: 'var(--space-lg)', 
                padding: 'var(--space-md)', 
                background: 'rgba(var(--primary-rgb), 0.05)',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.875rem',
                color: 'var(--on-surface-variant)'
              }}>
                <strong>📝 Need help?</strong><br />
                Contact your survey administrator if you don't have your authorization code or if you're experiencing access issues.
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="app-container">
        <div style={{ textAlign: 'center', padding: '4rem' }}>
          <div className="alert alert-success">
            <h2>🎉 Thank you for your feedback!</h2>
            <p>Your responses have been submitted successfully.</p>
          </div>
          <div style={{ marginTop: '2rem' }}>
            <p><strong>Survey:</strong> {survey?.title}</p>
            <p><strong>Feedback Type:</strong> {survey?.feedback_type?.charAt(0).toUpperCase() + survey?.feedback_type?.slice(1)}</p>
            <p style={{ color: 'var(--on-surface-variant)', fontSize: '0.875rem' }}>
              You can now close this window.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];
  const progress = questions.length > 0 ? ((currentQuestionIndex + 1) / questions.length) * 100 : 0;

  return (
    <div className="app-container">
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem 1rem' }}>
        {/* Survey Header */}
        <div className="card" style={{ marginBottom: '2rem' }}>
          <div className="card-header">
            <h1 className="card-title">📋 {survey?.title}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
              <span style={{ 
                background: 'var(--primary)', 
                color: 'var(--on-primary)', 
                padding: '0.25rem 0.75rem', 
                borderRadius: 'var(--radius-full)',
                fontSize: '0.875rem',
                fontWeight: '500',
                textTransform: 'capitalize'
              }}>
                {survey?.feedback_type} Assessment
              </span>
              <span style={{ color: 'var(--on-surface-variant)', fontSize: '0.875rem' }}>
                {questions.length} Questions
              </span>
            </div>
          </div>
          {survey?.description && (
            <div className="card-content">
              <p>{survey.description}</p>
            </div>
          )}
        </div>

        {/* Progress Bar */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--on-surface-variant)' }}>
              Question {currentQuestionIndex + 1} of {questions.length}
            </span>
            <span style={{ fontSize: '0.875rem', color: 'var(--on-surface-variant)' }}>
              {Math.round(progress)}% Complete
            </span>
          </div>
          <div style={{ 
            width: '100%', 
            height: '8px', 
            backgroundColor: 'var(--surface-variant)', 
            borderRadius: '4px',
            overflow: 'hidden'
          }}>
            <div style={{ 
              width: `${progress}%`, 
              height: '100%', 
              backgroundColor: 'var(--primary)',
              transition: 'width 0.3s ease'
            }} />
          </div>
        </div>

        {/* Question Navigation */}
        <div style={{ 
          display: 'flex', 
          gap: '0.5rem', 
          marginBottom: '2rem', 
          flexWrap: 'wrap',
          justifyContent: 'center'
        }}>
          {questions.map((_, index) => (
            <button
              key={index}
              className={`btn btn-sm ${index === currentQuestionIndex ? 'btn-primary' : responses[questions[index]?.id] ? 'btn-secondary' : 'btn-outline'}`}
              onClick={() => goToQuestion(index)}
              style={{ width: '40px', height: '40px' }}
            >
              {index + 1}
            </button>
          ))}
        </div>

        {/* Current Question */}
        {currentQuestion && (
          <form onSubmit={handleSubmit}>
            <div className="card" style={{ marginBottom: '2rem' }}>
              <div className="card-content">
                <div style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{ marginBottom: '0.5rem' }}>
                    {currentQuestion.question_text}
                    {currentQuestion.is_required && <span style={{ color: 'var(--error)' }}> *</span>}
                  </h3>
                  {currentQuestion.category_name && (
                    <span style={{ 
                      color: 'var(--on-surface-variant)', 
                      fontSize: '0.875rem',
                      background: 'var(--surface-variant)',
                      padding: '0.25rem 0.5rem',
                      borderRadius: 'var(--radius-xs)'
                    }}>
                      {currentQuestion.category_name}
                    </span>
                  )}
                </div>

                {currentQuestion.question_type === 'mcq' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {currentQuestion.options?.map(option => (
                      <label 
                        key={option.id} 
                        className="radio-label"
                        style={{ 
                          display: 'flex', 
                          alignItems: 'flex-start', 
                          gap: '0.75rem',
                          padding: '1rem',
                          border: '2px solid var(--outline-variant)',
                          borderRadius: 'var(--radius-md)',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          ...(responses[currentQuestion.id] === option.option_text ? {
                            borderColor: 'var(--primary)',
                            backgroundColor: 'rgba(var(--primary-rgb), 0.05)'
                          } : {})
                        }}
                      >
                        <input
                          type="radio"
                          name={`question-${currentQuestion.id}`}
                          value={option.option_text}
                          checked={responses[currentQuestion.id] === option.option_text}
                          onChange={(e) => handleResponseChange(currentQuestion.id, e.target.value)}
                          style={{ marginTop: '0.125rem' }}
                        />
                        <div>
                          <div style={{ fontWeight: '500', marginBottom: '0.25rem' }}>
                            {option.option_text}
                          </div>
                          {option.option_description && (
                            <div style={{ fontSize: '0.875rem', color: 'var(--on-surface-variant)' }}>
                              {option.option_description}
                            </div>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                ) : (
                  <textarea
                    value={responses[currentQuestion.id] || ''}
                    onChange={(e) => handleResponseChange(currentQuestion.id, e.target.value)}
                    placeholder="Please provide your detailed response..."
                    rows={6}
                    style={{ 
                      width: '100%', 
                      resize: 'vertical',
                      minHeight: '120px'
                    }}
                  />
                )}
              </div>
            </div>

            {/* Navigation and Submit */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={prevQuestion}
                disabled={currentQuestionIndex === 0}
              >
                ← Previous
              </button>

              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                {currentQuestionIndex === questions.length - 1 ? (
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={submitting}
                  >
                    {submitting ? '⏳ Submitting...' : '✅ Submit Survey'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={nextQuestion}
                  >
                    Next →
                  </button>
                )}
              </div>
            </div>

            {error && (
              <div className="alert alert-error" style={{ marginTop: '1rem' }}>
                {error}
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

export default SurveyTaking;
