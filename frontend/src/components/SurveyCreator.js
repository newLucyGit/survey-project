import React, { useState, useEffect } from 'react';
import axios from 'axios';
import '../App.css';

const API = 'http://localhost:5000/api';

const FEEDBACK_TYPES = [
  { id: 'self', label: 'Self Evaluation', description: 'Questions for self-assessment' },
  { id: 'manager', label: 'Manager Feedback', description: 'Questions for manager evaluation' },
  { id: 'reportee', label: 'Reportee Feedback', description: 'Questions for direct reports' },
  { id: 'peer', label: 'Peer Feedback', description: 'Questions for peer evaluation' }
];

export default function SurveyCreator({ token }) {
  const [surveys, setSurveys] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [categories, setCategories] = useState([]);
  const [questions, setQuestions] = useState([]);
  
  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [surveyType, setSurveyType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // View/Edit states
  const [viewingSurvey, setViewingSurvey] = useState(null);
  const [editingSurvey, setEditingSurvey] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  // View details extras
  const [viewingParticipants, setViewingParticipants] = useState({ self: [], manager: [], reportee: [], peer: [] });
  const [viewingSummary, setViewingSummary] = useState({ totalParticipants: 0, byType: { self: 0, manager: 0, reportee: 0, peer: 0 }, totalSubmissions: 0 });
  
  // Start Survey states
  const [startingSurvey, setStartingSurvey] = useState(null);
  const [surveyUrls, setSurveyUrls] = useState([]);
  const [showUrlsModal, setShowUrlsModal] = useState(false);
  // Responses viewing states
  const [showResponsesModal, setShowResponsesModal] = useState(false);
  const [responsesLoading, setResponsesLoading] = useState(false);
  const [responsesError, setResponsesError] = useState('');
  const [responsesRows, setResponsesRows] = useState([]);
  const [responsesSurveyId, setResponsesSurveyId] = useState(null);
  const [responsesFilterType, setResponsesFilterType] = useState(''); // '', self, manager, reportee, peer
  // Assign participants modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignSurveyId, setAssignSurveyId] = useState(null);
  const [assignEmployees, setAssignEmployees] = useState([]);
  // Flat per-type assignments
  const [participantsByType, setParticipantsByType] = useState({ self: [], manager: [], reportee: [], peer: [] });
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState('');
  
  // Feedback types configuration
  const [feedbackTypes, setFeedbackTypes] = useState(
    FEEDBACK_TYPES.map(ft => ({
      ...ft,
      enabled: true,
      title: ft.label,
      description: ft.description,
      selectedQuestions: []
    }))
  );
  
  const [selectedCategory, setSelectedCategory] = useState('');
  const [showQuestionBank, setShowQuestionBank] = useState(false);
  const [activeFeedbackType, setActiveFeedbackType] = useState('self');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchAll = () => {
    setLoading(true);
    setError('');
    Promise.all([
      axios.get(`${API}/surveys`, { headers: { Authorization: `Bearer ${token}` } }).catch(err => { throw new Error('Failed to load surveys: ' + (err.response?.data?.error || err.message)); }),
      axios.get(`${API}/companies`, { headers: { Authorization: `Bearer ${token}` } }).catch(err => { throw new Error('Failed to load companies: ' + (err.response?.data?.error || err.message)); }),
      axios.get(`${API}/categories`, { headers: { Authorization: `Bearer ${token}` } }).catch(err => { throw new Error('Failed to load categories: ' + (err.response?.data?.error || err.message)); }),
      axios.get(`${API}/questions`, { headers: { Authorization: `Bearer ${token}` } }).catch(err => { throw new Error('Failed to load questions: ' + (err.response?.data?.error || err.message)); })
    ])
      .then(([surveyRes, compRes, catRes, qRes]) => {
        setSurveys(surveyRes.data);
        setCompanies(compRes.data);
        setCategories(catRes.data);
        setQuestions(qRes.data);
      })
      .catch((err) => setError(err.message || 'Failed to load data.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, [token]);

  const fetchResponses = async (surveyId, feedbackType = '') => {
    setResponsesSurveyId(surveyId);
    setResponsesLoading(true);
    setResponsesError('');
    try {
      const url = feedbackType
        ? `${API}/surveys/${surveyId}/responses?feedback_type=${encodeURIComponent(feedbackType)}`
        : `${API}/surveys/${surveyId}/responses`;
      const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
      setResponsesRows(res.data || []);
    } catch (err) {
      setResponsesError('Failed to load responses: ' + (err.response?.data?.error || err.message));
      setResponsesRows([]);
    } finally {
      setResponsesLoading(false);
    }
  };

  const handleViewResponses = async (surveyId) => {
    setResponsesFilterType('');
    setShowResponsesModal(true);
    await fetchResponses(surveyId);
  };

  const loadAssignments = async (surveyId) => {
    setAssignError('');
    setAssignLoading(true);
    try {
      // Determine company id for the survey from local state or fetch survey details as fallback
      let surveyCompanyId = surveys.find(s => s.id === surveyId)?.company_id;
      if (!surveyCompanyId) {
        const sRes = await axios.get(`${API}/surveys/${surveyId}`, { headers: { Authorization: `Bearer ${token}` } });
        surveyCompanyId = sRes.data?.company_id;
      }

      const [empsRes, partRes] = await Promise.all([
        axios.get(`${API}/companies/${surveyCompanyId}/employees`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API}/surveys/${surveyId}/participants`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      setAssignEmployees(empsRes.data || []);
      const data = partRes.data || {};
      setParticipantsByType({
        self: (data.legacy?.self || []).map(e => e.employee_id),
        manager: (data.legacy?.manager || []).map(e => e.employee_id),
        reportee: (data.legacy?.reportee || []).map(e => e.employee_id),
        peer: (data.legacy?.peer || []).map(e => e.employee_id)
      });
    } catch (err) {
      setAssignError('Failed to load participants: ' + (err.response?.data?.error || err.message));
      setAssignEmployees([]);
      setParticipantsByType({ self: [], manager: [], reportee: [], peer: [] });
    } finally {
      setAssignLoading(false);
    }
  };

  const handleAssignParticipants = async (surveyId) => {
    setAssignSurveyId(surveyId);
    setShowAssignModal(true);
    await loadAssignments(surveyId);
  };

  const toggleParticipant = (ft, employeeId) => {
    setParticipantsByType(prev => {
      const set = new Set(prev[ft] || []);
      if (set.has(employeeId)) set.delete(employeeId); else set.add(employeeId);
      return { ...prev, [ft]: Array.from(set) };
    });
  };

  const saveParticipants = async (ft) => {
    setAssignError('');
    try {
      await axios.put(`${API}/surveys/${assignSurveyId}/participants`, {
        feedback_type: ft,
        employee_ids: participantsByType[ft]
      }, { headers: { Authorization: `Bearer ${token}` } });
      setSuccess(`Saved ${ft} participants.`);
      setTimeout(() => setSuccess(''), 2000);
      await loadAssignments(assignSurveyId);
    } catch (err) {
      setAssignError('Failed to save participants: ' + (err.response?.data?.error || err.message));
    }
  };

  const saveAllParticipants = async () => {
    setAssignError('');
    try {
      const fts = ['self','manager','reportee','peer'];
      await Promise.all(fts.map(ft => axios.put(
        `${API}/surveys/${assignSurveyId}/participants`,
        { feedback_type: ft, employee_ids: participantsByType[ft] },
        { headers: { Authorization: `Bearer ${token}` } }
      )));
      setSuccess('Saved participants for all roles.');
      setTimeout(() => setSuccess(''), 2000);
      await loadAssignments(assignSurveyId);
    } catch (err) {
      setAssignError('Failed to save participants: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleCreateSurvey = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    const enabledFeedbackTypes = feedbackTypes.filter(ft => ft.enabled);
    
    if (enabledFeedbackTypes.length === 0) {
      setError('Please enable at least one feedback type.');
      return;
    }
    
    const hasQuestionsInEnabledTypes = enabledFeedbackTypes.some(ft => ft.selectedQuestions.length > 0);
    if (!hasQuestionsInEnabledTypes) {
      setError('Please select at least one question for enabled feedback types.');
      return;
    }
    
    const surveyData = {
      title,
      description,
      company_id: parseInt(companyId),
      survey_type: surveyType,
      start_date: startDate,
      end_date: endDate,
      feedback_types: enabledFeedbackTypes.map(ft => ({
        type: ft.id,
        title: ft.title,
        description: ft.description,
        questions: ft.selectedQuestions.map((q, index) => ({
          id: q.id,
          position: index + 1
        }))
      }))
    };
    
    try {
      await axios.post(`${API}/surveys`, surveyData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setSuccess('360-degree survey created successfully!');
      clearForm();
      fetchAll();
    } catch (err) {
      setError('Failed to create survey: ' + (err.response?.data?.error || err.message));
    }
  };

  const clearForm = () => {
    setTitle('');
    setDescription('');
    setCompanyId('');
    setSurveyType('');
    setStartDate('');
    setEndDate('');
    setFeedbackTypes(
      FEEDBACK_TYPES.map(ft => ({
        ...ft,
        enabled: true,
        title: ft.label,
        description: ft.description,
        selectedQuestions: []
      }))
    );
    setActiveFeedbackType('self');
    setShowQuestionBank(false);
  };

  const updateFeedbackType = (typeId, updates) => {
    setFeedbackTypes(prev => prev.map(ft => 
      ft.id === typeId ? { ...ft, ...updates } : ft
    ));
  };

  const addQuestionToFeedbackType = (typeId, question) => {
    const feedbackType = feedbackTypes.find(ft => ft.id === typeId);
    if (!feedbackType.selectedQuestions.find(q => q.id === question.id)) {
      updateFeedbackType(typeId, {
        selectedQuestions: [...feedbackType.selectedQuestions, question]
      });
    }
  };

  const removeQuestionFromFeedbackType = (typeId, questionId) => {
    const feedbackType = feedbackTypes.find(ft => ft.id === typeId);
    updateFeedbackType(typeId, {
      selectedQuestions: feedbackType.selectedQuestions.filter(q => q.id !== questionId)
    });
  };

  const moveQuestionInFeedbackType = (typeId, index, direction) => {
    const feedbackType = feedbackTypes.find(ft => ft.id === typeId);
    const newQuestions = [...feedbackType.selectedQuestions];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (newIndex >= 0 && newIndex < newQuestions.length) {
      [newQuestions[index], newQuestions[newIndex]] = [newQuestions[newIndex], newQuestions[index]];
      updateFeedbackType(typeId, { selectedQuestions: newQuestions });
    }
  };

  const copyQuestionsToOtherTypes = (sourceTypeId) => {
    const sourceType = feedbackTypes.find(ft => ft.id === sourceTypeId);
    if (sourceType.selectedQuestions.length === 0) return;
    
    setFeedbackTypes(prev => prev.map(ft => 
      ft.id !== sourceTypeId && ft.enabled ? {
        ...ft,
        selectedQuestions: [...sourceType.selectedQuestions]
      } : ft
    ));
  };

  const handleViewSurvey = async (surveyId) => {
    setError('');
    try {
      const headers = { headers: { Authorization: `Bearer ${token}` } };
      const [surveyRes, partsRes, respRes] = await Promise.all([
        axios.get(`${API}/surveys/${surveyId}`, headers),
        axios.get(`${API}/surveys/${surveyId}/participants`, headers).catch(() => ({ data: { legacy: {} } })),
        axios.get(`${API}/surveys/${surveyId}/responses`, headers).catch(() => ({ data: [] }))
      ]);
      setViewingSurvey(surveyRes.data);
      const legacy = partsRes.data?.legacy || {};
      const byType = {
        self: legacy.self || [],
        manager: legacy.manager || [],
        reportee: legacy.reportee || [],
        peer: legacy.peer || []
      };
      setViewingParticipants(byType);
      // Unique participant count across all types
      const uniqueIds = new Set([
        ...(byType.self || []).map(e => e.employee_id),
        ...(byType.manager || []).map(e => e.employee_id),
        ...(byType.reportee || []).map(e => e.employee_id),
        ...(byType.peer || []).map(e => e.employee_id)
      ]);
      // Total submissions: count distinct employee_email+feedback_type pairs
      const respRows = respRes.data || [];
      const submissionKeys = new Set(respRows.map(r => `${r.employee_email}||${r.feedback_type}`));
      setViewingSummary({
        totalParticipants: uniqueIds.size,
        byType: {
          self: byType.self.length,
          manager: byType.manager.length,
          reportee: byType.reportee.length,
          peer: byType.peer.length
        },
        totalSubmissions: submissionKeys.size
      });
    } catch (err) {
      setError('Failed to load survey details: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleEditSurvey = async (surveyId) => {
    setError('');
    try {
      const response = await axios.get(`${API}/surveys/${surveyId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const survey = response.data;
      
      // Check if survey can be edited
      if (survey.status !== 'draft') {
        setError('Survey cannot be edited once it has been started. Only draft surveys can be edited.');
        return;
      }
      
      // Populate form with existing survey data
      setTitle(survey.title || '');
      setDescription(survey.description || '');
      setCompanyId(survey.company_id?.toString() || '');
      setSurveyType(survey.survey_type || '');
      setStartDate(survey.start_date?.split('T')[0] || '');
      setEndDate(survey.end_date?.split('T')[0] || '');
      
      // Populate feedback types if available
      if (survey.feedback_types && Array.isArray(survey.feedback_types)) {
        const surveyFeedbackTypes = FEEDBACK_TYPES.map(ft => {
          const existingFt = survey.feedback_types.find(sft => sft.type === ft.id);
          if (existingFt) {
            // Transform survey questions to a format compatible with the frontend
            // These are independent from the question bank (decoupled)
            const transformedQuestions = (existingFt.questions || []).map(sq => ({
              id: `survey_${sq.id}`, // Prefix with 'survey_' to distinguish from question bank
              text: sq.question_text,
              type: sq.question_type,
              category_id: null, // Not tied to question bank categories anymore
              category_name: sq.category_name || 'Uncategorized',
              survey_question_id: sq.id, // Keep reference to survey question for updates
              is_survey_question: true // Flag to identify this as a survey question
            }));
            
            return {
              ...ft,
              enabled: true,
              title: existingFt.title || ft.label,
              description: existingFt.description || ft.description,
              selectedQuestions: transformedQuestions
            };
          } else {
            return {
              ...ft,
              enabled: false,
              title: ft.label,
              description: ft.description,
              selectedQuestions: []
            };
          }
        });
        setFeedbackTypes(surveyFeedbackTypes);
      }
      
      setEditingSurvey(survey);
      setIsEditing(true);
      setActiveFeedbackType('self');
      setShowQuestionBank(false);
      
      // Scroll to form
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError('Failed to load survey for editing: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleUpdateSurvey = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    const enabledFeedbackTypes = feedbackTypes.filter(ft => ft.enabled);
    
    if (enabledFeedbackTypes.length === 0) {
      setError('Please enable at least one feedback type.');
      return;
    }
    
    const hasQuestionsInEnabledTypes = enabledFeedbackTypes.some(ft => ft.selectedQuestions.length > 0);
    if (!hasQuestionsInEnabledTypes) {
      setError('Please select at least one question for enabled feedback types.');
      return;
    }
    
    const surveyData = {
      title,
      description,
      company_id: parseInt(companyId),
      survey_type: surveyType,
      start_date: startDate,
      end_date: endDate,
      feedback_types: enabledFeedbackTypes.map(ft => ({
        type: ft.id,
        title: ft.title,
        description: ft.description,
        questions: ft.selectedQuestions.map((q, index) => {
          if (q.is_survey_question) {
            // Existing survey question - preserve it as is
            return {
              survey_question_id: q.survey_question_id,
              question_text: q.text,
              question_type: q.type,
              category_name: q.category_name,
              position: index + 1,
              is_existing: true
            };
          } else {
            // New question from question bank
            return {
              id: q.id,
              position: index + 1,
              is_existing: false
            };
          }
        })
      }))
    };
    
    try {
      await axios.put(`${API}/surveys/${editingSurvey.id}`, surveyData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setSuccess('Survey updated successfully!');
      clearForm();
      setIsEditing(false);
      setEditingSurvey(null);
      fetchAll();
    } catch (err) {
      setError('Failed to update survey: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditingSurvey(null);
    clearForm();
  };

  const handleStartSurvey = async (surveyId) => {
    setError('');
    setStartingSurvey(surveyId);
    
    try {
      const response = await axios.post(`${API}/surveys/${surveyId}/start`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // For single URL, adapt structure
      const singleUrl = [{ feedback_type: 'all', url: response.data.url, url_token: response.data.url_token, is_active: true }];
      setSurveyUrls(singleUrl);
      setStartingSurvey(surveyId);
      setShowUrlsModal(true);
      await fetchAll();
      setSuccess(`Survey "${response.data.survey_title}" started successfully!`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Failed to start survey: ' + (err.response?.data?.error || err.message));
      setStartingSurvey(null);
    }
  };

  const handleViewSurveyUrls = async (surveyId) => {
    setError('');
    try {
      const response = await axios.get(`${API}/surveys/${surveyId}/urls`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSurveyUrls(response.data);
      setStartingSurvey(surveyId);
      setShowUrlsModal(true);
    } catch (err) {
      setError('Failed to load survey URLs: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleEndSurvey = async (surveyId) => {
    setError('');
    if (!window.confirm('End this survey now? Participants will no longer be able to submit or be assigned.')) return;
    try {
      await axios.put(`${API}/surveys/${surveyId}/status`, { status: 'completed' }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSuccess('Survey ended successfully.');
      setTimeout(() => setSuccess(''), 2000);
      await fetchAll();
    } catch (err) {
      setError('Failed to end survey: ' + (err.response?.data?.error || err.message));
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      setSuccess('URL copied to clipboard!');
      setTimeout(() => setSuccess(''), 2000);
    }).catch(() => {
      setError('Failed to copy URL to clipboard');
    });
  };

  const getCompanyName = (companyId) => {
    const company = companies.find(c => c.id === companyId);
    return company ? company.name : 'Unknown';
  };

  const getCategoryName = (categoryId) => {
    const category = categories.find(c => c.id === categoryId);
    return category ? category.name : 'Uncategorized';
  };

  const getStatusBadge = (status) => {
    const colors = {
      draft: { bg: 'var(--surface-variant)', color: 'var(--on-surface-variant)' },
      active: { bg: 'var(--primary)', color: 'var(--on-primary)' },
      completed: { bg: 'var(--tertiary)', color: 'var(--on-tertiary)' },
      archived: { bg: 'var(--outline)', color: 'var(--on-surface)' }
    };
    
    const style = colors[status] || colors.draft;
    
    return (
      <span style={{
        background: style.bg,
        color: style.color,
        padding: '4px 8px',
        borderRadius: 'var(--radius-xs)',
        fontSize: '0.75rem',
        fontWeight: '500',
        textTransform: 'capitalize'
      }}>
        {status}
      </span>
    );
  };

  const activeFeedbackTypeData = feedbackTypes.find(ft => ft.id === activeFeedbackType);
  const filteredQuestions = selectedCategory 
    ? questions.filter(q => q.category_id == selectedCategory)
    : questions;

  const totalSelectedQuestions = feedbackTypes.reduce((sum, ft) => sum + (ft.enabled ? ft.selectedQuestions.length : 0), 0);

  if (loading) return <div className="loading">Loading survey data...</div>;

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">🎯 360-Degree Survey Creator</h2>
        <p className="page-subtitle">Create comprehensive feedback surveys with self, manager, reportee, and peer evaluations</p>
      </div>

      {/* Survey Creation Form */}
      <div className="form-container" style={{ marginBottom: 'var(--space-lg)' }}>
        <h3 className="form-title">
          {isEditing ? '✏️ Edit 360-Degree Survey' : '➕ Create New 360-Degree Survey'}
        </h3>
        {isEditing && (
          <div className="alert alert-info" style={{ marginBottom: 'var(--space-md)' }}>
            Editing survey: <strong>{editingSurvey?.title}</strong>
          </div>
        )}
        <form onSubmit={isEditing ? handleUpdateSurvey : handleCreateSurvey}>
          {/* Basic Survey Information */}
          <div className="form-grid">
            <div className="form-field">
              <label className="form-label">Survey Title</label>
              <input 
                value={title} 
                onChange={e => setTitle(e.target.value)} 
                placeholder="Enter survey title" 
                required 
              />
            </div>
            <div className="form-field">
              <label className="form-label">Company</label>
              <select 
                value={companyId} 
                onChange={e => setCompanyId(e.target.value)} 
                required
              >
                <option value="">Select a company</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label className="form-label">Survey Type</label>
              <select 
                value={surveyType} 
                onChange={e => setSurveyType(e.target.value)} 
                required
              >
                <option value="">Select survey type</option>
                <option value="pre">Pre-360 Assessment</option>
                <option value="post">Post-360 Assessment</option>
                <option value="both">Combined Pre & Post</option>
              </select>
            </div>
            <div className="form-field">
              <label className="form-label">Start Date</label>
              <input 
                type="date"
                value={startDate} 
                onChange={e => setStartDate(e.target.value)} 
                required 
              />
            </div>
            <div className="form-field">
              <label className="form-label">End Date</label>
              <input 
                type="date"
                value={endDate} 
                onChange={e => setEndDate(e.target.value)} 
                required 
                min={startDate}
              />
            </div>
          </div>
          
          <div className="form-field">
            <label className="form-label">Description (Optional)</label>
            <textarea 
              value={description} 
              onChange={e => setDescription(e.target.value)} 
              placeholder="Enter survey description"
              rows="3"
            />
          </div>

          {/* Feedback Types Configuration */}
          <div style={{ marginTop: 'var(--space-lg)' }}>
            <h4>🎯 Feedback Types Configuration</h4>
            <p style={{ color: 'var(--on-surface-variant)', marginBottom: 'var(--space-md)' }}>
              Configure which types of feedback to collect and customize questions for each type.
            </p>

            {/* Feedback Type Toggles */}
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
              gap: 'var(--space-md)', 
              marginBottom: 'var(--space-lg)' 
            }}>
              {feedbackTypes.map(ft => (
                <div key={ft.id} className="card" style={{ padding: 'var(--space-md)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 'var(--space-sm)' }}>
                    <input 
                      type="checkbox" 
                      checked={ft.enabled}
                      onChange={e => updateFeedbackType(ft.id, { enabled: e.target.checked })}
                      style={{ marginRight: 'var(--space-sm)' }}
                    />
                    <span style={{ fontWeight: '500' }}>{ft.label}</span>
                  </div>
                  
                  {ft.enabled && (
                    <>
                      <div className="form-field" style={{ marginBottom: 'var(--space-sm)' }}>
                        <input 
                          placeholder="Custom title"
                          value={ft.title}
                          onChange={e => updateFeedbackType(ft.id, { title: e.target.value })}
                          style={{ fontSize: '0.875rem' }}
                        />
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)' }}>
                        {ft.selectedQuestions.length} questions selected
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* Feedback Type Tabs */}
            <div style={{ borderBottom: '1px solid var(--outline-variant)', marginBottom: 'var(--space-md)' }}>
              {feedbackTypes.filter(ft => ft.enabled).map(ft => (
                <button 
                  key={ft.id}
                  type="button"
                  className={`btn btn-tab ${activeFeedbackType === ft.id ? 'active' : ''}`}
                  onClick={() => setActiveFeedbackType(ft.id)}
                  style={{ 
                    marginRight: 'var(--space-sm)',
                    borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0'
                  }}
                >
                  {ft.title} ({ft.selectedQuestions.length})
                </button>
              ))}
            </div>

            {/* Active Feedback Type Questions */}
            {activeFeedbackTypeData && activeFeedbackTypeData.enabled && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
                  <h5>Questions for {activeFeedbackTypeData.title}</h5>
                  <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                    {activeFeedbackTypeData.selectedQuestions.length > 0 && (
                      <button 
                        type="button" 
                        className="btn btn-sm btn-outline"
                        onClick={() => copyQuestionsToOtherTypes(activeFeedbackType)}
                        title="Copy these questions to all other enabled feedback types"
                      >
                        📋 Copy to Others
                      </button>
                    )}
                    <button 
                      type="button" 
                      className="btn btn-outline"
                      onClick={() => setShowQuestionBank(!showQuestionBank)}
                    >
                      {showQuestionBank ? '📋 Hide Question Bank' : '➕ Add Questions'}
                    </button>
                  </div>
                </div>

                {activeFeedbackTypeData.selectedQuestions.length === 0 ? (
                  <div className="card" style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
                    <p style={{ color: 'var(--on-surface-variant)', margin: 0 }}>
                      No questions selected for {activeFeedbackTypeData.title}. Click "Add Questions" to browse the question bank.
                    </p>
                  </div>
                ) : (
                  <div className="card">
                    {activeFeedbackTypeData.selectedQuestions.map((question, index) => (
                      <div key={question.id} style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        padding: 'var(--space-sm)',
                        borderBottom: index < activeFeedbackTypeData.selectedQuestions.length - 1 ? '1px solid var(--outline-variant)' : 'none'
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '500', marginBottom: '4px' }}>
                            {question.is_survey_question && (
                              <span style={{
                                background: 'var(--warning-container)',
                                color: 'var(--on-warning-container)',
                                padding: '2px 6px',
                                borderRadius: 'var(--radius-xs)',
                                fontSize: '0.7rem',
                                marginRight: '8px',
                                fontWeight: '500'
                              }}>
                                📋 SURVEY
                              </span>
                            )}
                            {index + 1}. {question.text}
                          </div>
                          <div style={{ fontSize: '0.875rem', color: 'var(--on-surface-variant)' }}>
                            {question.category_name || getCategoryName(question.category_id)} • {question.type.toUpperCase()}
                            {question.is_survey_question && (
                              <span style={{ marginLeft: '8px', fontStyle: 'italic' }}>
                                (Decoupled from question bank)
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                          <button 
                            type="button" 
                            className="btn btn-sm btn-outline"
                            onClick={() => moveQuestionInFeedbackType(activeFeedbackType, index, 'up')}
                            disabled={index === 0}
                          >
                            ⬆️
                          </button>
                          <button 
                            type="button" 
                            className="btn btn-sm btn-outline"
                            onClick={() => moveQuestionInFeedbackType(activeFeedbackType, index, 'down')}
                            disabled={index === activeFeedbackTypeData.selectedQuestions.length - 1}
                          >
                            ⬇️
                          </button>
                          <button 
                            type="button" 
                            className="btn btn-sm btn-danger"
                            onClick={() => removeQuestionFromFeedbackType(activeFeedbackType, question.id)}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Question Bank */}
            {showQuestionBank && (
              <div style={{ marginTop: 'var(--space-lg)' }}>
                <h4>Question Bank</h4>
                <div style={{ marginBottom: 'var(--space-md)' }}>
                  <select 
                    value={selectedCategory} 
                    onChange={e => setSelectedCategory(e.target.value)}
                    style={{ minWidth: '200px' }}
                  >
                    <option value="">All Categories</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                
                <div className="card" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {filteredQuestions.map((question, index) => {
                    // Check if this question bank question is already selected in the active feedback type
                    const isSelectedInActiveType = activeFeedbackTypeData?.selectedQuestions.find(q => {
                      // Direct match by ID (for question bank questions)
                      if (q.id === question.id) return true;
                      
                      // Content match (for survey questions that might have same content)
                      if (q.is_survey_question && q.text === question.text && q.type === question.type) {
                        return true;
                      }
                      
                      return false;
                    });
                    
                    return (
                      <div key={question.id} style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        padding: 'var(--space-sm)',
                        borderBottom: index < filteredQuestions.length - 1 ? '1px solid var(--outline-variant)' : 'none',
                        opacity: isSelectedInActiveType ? 0.6 : 1
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '500', marginBottom: '4px' }}>
                            {question.text}
                          </div>
                          <div style={{ fontSize: '0.875rem', color: 'var(--on-surface-variant)' }}>
                            {question.category_name || getCategoryName(question.category_id)} • {question.type.toUpperCase()}
                          </div>
                        </div>
                        <button 
                          type="button" 
                          className={`btn btn-sm ${isSelectedInActiveType ? 'btn-outline' : 'btn-primary'}`}
                          onClick={() => isSelectedInActiveType 
                            ? removeQuestionFromFeedbackType(activeFeedbackType, question.id)
                            : addQuestionToFeedbackType(activeFeedbackType, question)
                          }
                        >
                          {isSelectedInActiveType ? '✅ Added' : '➕ Add'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div style={{ marginTop: 'var(--space-lg)' }}>
            <div style={{ marginBottom: 'var(--space-sm)', fontSize: '0.875rem', color: 'var(--on-surface-variant)' }}>
              Total questions across all feedback types: {totalSelectedQuestions}
            </div>
            <button type="submit" className="btn btn-primary" disabled={totalSelectedQuestions === 0}>
              {isEditing ? '💾 Update Survey' : '🎯 Create 360-Degree Survey'}
            </button>
            {isEditing ? (
              <button type="button" className="btn btn-outline" onClick={handleCancelEdit} style={{ marginLeft: 'var(--space-sm)' }}>
                ❌ Cancel Edit
              </button>
            ) : (
              <button type="button" className="btn btn-outline" onClick={clearForm} style={{ marginLeft: 'var(--space-sm)' }}>
                🗑️ Clear Form
              </button>
            )}
          </div>
        </form>
        
        {error && <div className="alert alert-error" style={{ marginTop: 'var(--space-md)' }}>{error}</div>}
        {success && <div className="alert alert-success" style={{ marginTop: 'var(--space-md)' }}>{success}</div>}
      </div>

      {/* Existing Surveys */}
      <div className="page-header">
        <h3 className="page-title">Existing Surveys ({surveys.length})</h3>
      </div>

      {surveys.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-2xl)' }}>
          <h4 style={{ color: 'var(--on-surface-variant)', margin: '0 0 var(--space-sm) 0' }}>
            📝 No surveys found
          </h4>
          <p style={{ color: 'var(--on-surface-variant)', margin: 0 }}>
            Create your first 360-degree survey using the form above
          </p>
        </div>
      ) : (
        <div className="card-grid">
          {surveys.map(survey => (
            <div className="card" key={survey.id}>
              <div className="card-header">
                <div>
                  <h3 className="card-title">🎯 {survey.title}</h3>
                  <p className="card-subtitle">
                    Created {new Date(survey.created_at).toLocaleDateString()}
                  </p>
                </div>
                {getStatusBadge(survey.status)}
              </div>
              <div className="card-content">
                <div style={{ marginBottom: 'var(--space-sm)' }}>
                  <strong>🏢 Company:</strong> {survey.company_name || getCompanyName(survey.company_id)}
                </div>
                <div style={{ marginBottom: 'var(--space-sm)' }}>
                  <strong>📊 Type:</strong> {survey.survey_type.charAt(0).toUpperCase() + survey.survey_type.slice(1)}
                </div>
                <div style={{ marginBottom: 'var(--space-sm)' }}>
                  <strong>📅 Duration:</strong> {new Date(survey.start_date).toLocaleDateString()} - {new Date(survey.end_date).toLocaleDateString()}
                </div>
                <div style={{ marginBottom: 'var(--space-sm)' }}>
                  <strong>❓ Total Questions:</strong> {survey.question_count || 0}
                </div>
                {survey.description && (
                  <div>
                    <strong>📝 Description:</strong><br />
                    <span style={{ fontSize: '0.875rem', color: 'var(--on-surface-variant)' }}>
                      {survey.description}
                    </span>
                  </div>
                )}
              </div>
              <div className="card-actions">
                {/* View */}
                <button 
                  className="btn btn-outline btn-sm"
                  onClick={() => handleViewSurvey(survey.id)}
                >
                  👁️ View
                </button>
                {/* Edit (only in draft) */}
                {survey.status === 'draft' && (
                  <button 
                    className="btn btn-outline btn-sm"
                    onClick={() => handleEditSurvey(survey.id)}
                  >
                    ✏️ Edit
                  </button>
                )}
                {/* Assign Participants (allowed in draft, or active until end date) */}
                {(() => {
                  const now = new Date();
                  const end = new Date(survey.end_date);
                  const canAssign = survey.status === 'draft' || (survey.status === 'active' && now <= end);
                  return canAssign ? (
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => handleAssignParticipants(survey.id)}
                    >
                      👥 Assign Participants
                    </button>
                  ) : null;
                })()}
                {/* Start Survey (only in draft) */}
                {survey.status === 'draft' && (
                  <button 
                    className="btn btn-primary btn-sm"
                    onClick={() => handleStartSurvey(survey.id)}
                    disabled={startingSurvey === survey.id}
                  >
                    {startingSurvey === survey.id ? '⏳ Starting...' : '🚀 Start Survey'}
                  </button>
                )}
                {/* View Responses (always available) */}
                <button 
                  className="btn btn-outline btn-sm"
                  onClick={() => handleViewResponses(survey.id)}
                >
                  📄 View Responses
                </button>
                {/* End Survey (only when active) */}
                {survey.status === 'active' && (
                  <button 
                    className="btn btn-danger btn-sm"
                    onClick={() => handleEndSurvey(survey.id)}
                  >
                    � End Survey
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View Survey Modal */}
      {viewingSurvey && (
        <div className="modal-overlay" onClick={() => setViewingSurvey(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px', maxHeight: '80vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h2>👁️ Survey Details</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setViewingSurvey(null)}>
                ✕
              </button>
            </div>
            
            <div className="modal-body">
              <div className="card" style={{ margin: 0 }}>
                <div className="card-header">
                  <h3 className="card-title">🎯 {viewingSurvey.title}</h3>
                  {getStatusBadge(viewingSurvey.status)}
                </div>
                
                <div className="card-content">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
                    <div>
                      <strong>🏢 Company:</strong><br />
                      {viewingSurvey.company_name || getCompanyName(viewingSurvey.company_id)}
                    </div>
                    <div>
                      <strong>📊 Type:</strong><br />
                      {viewingSurvey.survey_type?.charAt(0).toUpperCase() + viewingSurvey.survey_type?.slice(1)}
                    </div>
                    <div>
                      <strong>📅 Start Date:</strong><br />
                      {new Date(viewingSurvey.start_date).toLocaleDateString()}
                    </div>
                    <div>
                      <strong>📅 End Date:</strong><br />
                      {new Date(viewingSurvey.end_date).toLocaleDateString()}
                    </div>
                  </div>
                  {/* Summary counts */}
                  <div className="card" style={{ marginBottom: 'var(--space-md)', background: 'var(--surface-variant)' }}>
                    <div className="card-content" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                      <span className="badge">👥 Total Participants: {viewingSummary.totalParticipants}</span>
                      <span className="badge">📝 Total Submissions: {viewingSummary.totalSubmissions}</span>
                      <span className="badge">Self: {viewingSummary.byType.self}</span>
                      <span className="badge">Manager: {viewingSummary.byType.manager}</span>
                      <span className="badge">Reportee: {viewingSummary.byType.reportee}</span>
                      <span className="badge">Peer: {viewingSummary.byType.peer}</span>
                    </div>
                  </div>
                  
                  {viewingSurvey.description && (
                    <div style={{ marginBottom: 'var(--space-md)' }}>
                      <strong>📝 Description:</strong><br />
                      <p style={{ marginTop: 'var(--space-xs)', color: 'var(--on-surface-variant)' }}>
                        {viewingSurvey.description}
                      </p>
                    </div>
                  )}
                  
                  <div>
                    <strong>🧩 Questions:</strong>
                    {viewingSurvey.feedback_types && viewingSurvey.feedback_types.length > 0 ? (
                      <div style={{ marginTop: 'var(--space-sm)' }}>
                        {viewingSurvey.feedback_types.map(ft => (
                          <div key={ft.feedback_type} className="card" style={{ margin: 'var(--space-sm) 0', background: 'var(--surface-variant)' }}>
                            <div className="card-header" style={{ padding: 'var(--space-sm)' }}>
                              <h4 style={{ margin: 0, fontSize: '1rem' }}>
                                {ft.title || FEEDBACK_TYPES.find(ftype => ftype.id === ft.feedback_type)?.label}
                              </h4>
                              <span style={{ fontSize: '0.875rem', color: 'var(--on-surface-variant)' }}>
                                {ft.questions?.length || 0} questions
                              </span>
                            </div>
                            {ft.questions && ft.questions.length > 0 && (
                              <div style={{ padding: '0 var(--space-sm) var(--space-sm)' }}>
                                {ft.questions.map((q, index) => (
                                  <div key={index} style={{ 
                                    padding: 'var(--space-xs)', 
                                    borderLeft: '3px solid var(--primary)',
                                    marginBottom: 'var(--space-xs)',
                                    background: 'var(--surface)',
                                    borderRadius: '0 var(--radius-xs) var(--radius-xs) 0'
                                  }}>
                                    <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>
                                      {q.position}. {q.question_text}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)', marginTop: '2px' }}>
                                      {q.category_name} • {q.question_type?.toUpperCase()}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ color: 'var(--on-surface-variant)', marginTop: 'var(--space-xs)' }}>
                        No feedback types configured
                      </p>
                    )}
                  </div>

                  {/* Participants listing */}
                  <div style={{ marginTop: 'var(--space-lg)' }}>
                    <strong>👥 Participants:</strong>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--space-sm)', marginTop: 'var(--space-sm)' }}>
                      {['self','manager','reportee','peer'].map(ft => (
                        <div key={ft} className="card" style={{ margin: 0 }}>
                          <div className="card-header" style={{ padding: 'var(--space-sm)' }}>
                            <h4 style={{ margin: 0, fontSize: '1rem' }}>
                              {FEEDBACK_TYPES.find(x => x.id === ft)?.label} ({(viewingParticipants[ft]||[]).length})
                            </h4>
                          </div>
                          <div className="card-content" style={{ paddingTop: 0 }}>
                            {(viewingParticipants[ft]||[]).length === 0 ? (
                              <div style={{ color: 'var(--on-surface-variant)', fontSize: '0.9rem' }}>None selected.</div>
                            ) : (
                              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                {(viewingParticipants[ft]||[]).map(p => (
                                  <li key={`${ft}-${p.employee_id}`} style={{ padding: '6px 0', borderBottom: '1px solid var(--outline-variant)' }}>
                                    <span style={{ fontWeight: 500 }}>{p.name}</span>
                                    <span style={{ marginLeft: 8, color: 'var(--on-surface-variant)', fontSize: '0.85rem' }}>{p.email}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="modal-footer">
              {viewingSurvey.status === 'draft' && (
                <>
                  <button className="btn btn-outline" onClick={() => {
                    const surveyId = viewingSurvey.id;
                    setViewingSurvey(null);
                    handleEditSurvey(surveyId);
                  }}>
                    ✏️ Edit Survey
                  </button>
                  <button 
                    className="btn btn-primary" 
                    onClick={() => {
                      const surveyId = viewingSurvey.id;
                      setViewingSurvey(null);
                      handleStartSurvey(surveyId);
                    }}
                  >
                    🚀 Start Survey
                  </button>
                </>
              )}
              
              {viewingSurvey.status === 'active' && (
                <button 
                  className="btn btn-secondary" 
                  onClick={() => {
                    const surveyId = viewingSurvey.id;
                    setViewingSurvey(null);
                    handleViewSurveyUrls(surveyId);
                  }}
                >
                  🔗 View URLs
                </button>
              )}
              
              <button className="btn btn-primary" onClick={() => setViewingSurvey(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Survey URLs Modal */}
      {showUrlsModal && (
        <div className="modal-overlay" onClick={() => setShowUrlsModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px' }}>
            <div className="modal-header">
              <h2>🔗 Survey URL</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowUrlsModal(false)}>
                ✕
              </button>
            </div>
            
            <div className="modal-body">
              <div className="alert alert-info" style={{ marginBottom: 'var(--space-md)' }}>
                <strong>📋 Share this URL:</strong> Share a single link with participants. They must authenticate and will only access roles they’re assigned to.
              </div>
              {surveyUrls.map(urlData => (
                <div key={urlData.url_token} className="card" style={{ marginBottom: 'var(--space-sm)' }}>
                  <div className="card-content">
                    <div style={{ 
                      backgroundColor: 'var(--surface-variant)', 
                      padding: 'var(--space-sm)', 
                      borderRadius: '6px',
                      fontFamily: 'monospace',
                      fontSize: '0.875rem',
                      wordBreak: 'break-all',
                      marginBottom: 'var(--space-sm)'
                    }}>
                      {urlData.url}
                    </div>
                    <button 
                      className="btn btn-outline btn-sm"
                      onClick={() => copyToClipboard(urlData.url)}
                    >
                      📋 Copy URL
                    </button>
                  </div>
                </div>
              ))}
              <div className="alert alert-warning" style={{ marginTop: 'var(--space-md)' }}>
                <strong>⚠️ Important:</strong> Keep this URL secure. Anyone with access to it can attempt to authenticate.
              </div>
            </div>
            
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setShowUrlsModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Responses Modal */}
      {showResponsesModal && (
        <div className="modal-overlay" onClick={() => setShowResponsesModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px', maxHeight: '80vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h2>📄 Survey Responses</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowResponsesModal(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="card" style={{ marginBottom: 'var(--space-md)' }}>
                <div className="card-content" style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
                  <label htmlFor="resp-ft">Filter by feedback type:</label>
                  <select
                    id="resp-ft"
                    value={responsesFilterType}
                    onChange={async (e) => {
                      const ft = e.target.value;
                      setResponsesFilterType(ft);
                      await fetchResponses(responsesSurveyId, ft || '');
                    }}
                  >
                    <option value="">All</option>
                    <option value="self">Self</option>
                    <option value="manager">Manager</option>
                    <option value="reportee">Reportee</option>
                    <option value="peer">Peer</option>
                  </select>
                  <span style={{ marginLeft: 'auto', fontSize: '0.875rem', color: 'var(--on-surface-variant)' }}>
                    {responsesRows.length} records
                  </span>
                </div>
              </div>

              {responsesLoading && (
                <div className="loading">Loading responses...</div>
              )}
              {responsesError && (
                <div className="alert alert-error">{responsesError}</div>
              )}
              {!responsesLoading && !responsesError && responsesRows.length === 0 && (
                <div className="card" style={{ textAlign: 'center', padding: 'var(--space-lg)' }}>
                  <p style={{ margin: 0, color: 'var(--on-surface-variant)' }}>No responses yet.</p>
                </div>
              )}

              {!responsesLoading && !responsesError && responsesRows.length > 0 && (
                <div className="card" style={{ margin: 0 }}>
                  <div className="card-content">
                    {(() => {
                      // Group by employee_email + feedback_type
                      const groups = responsesRows.reduce((acc, row) => {
                        const key = `${row.employee_email}||${row.feedback_type}`;
                        if (!acc[key]) acc[key] = [];
                        acc[key].push(row);
                        return acc;
                      }, {});
                      const entries = Object.entries(groups);
                      return (
                        <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
                          {entries.map(([key, rows]) => {
                            const [email, ft] = key.split('||');
                            const sorted = [...rows].sort((a,b) => (a.position||0) - (b.position||0));
                            return (
                              <div key={key} className="card" style={{ margin: 0, background: 'var(--surface-variant)' }}>
                                <div className="card-header" style={{ padding: 'var(--space-sm)' }}>
                                  <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
                                    <strong>{email}</strong>
                                    <span className="badge">{ft}</span>
                                    <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--on-surface-variant)' }}>
                                      Submitted: {new Date(sorted[0].submitted_at).toLocaleString()}
                                    </span>
                                  </div>
                                </div>
                                <div className="card-content" style={{ paddingTop: 0 }}>
                                  {sorted.map((r) => (
                                    <div key={r.response_id} style={{
                                      padding: 'var(--space-xs) 0',
                                      borderBottom: '1px solid var(--outline-variant)'
                                    }}>
                                      <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                                        {r.position}. {r.question_text}
                                      </div>
                                      <div style={{ fontSize: '0.8rem', color: 'var(--on-surface-variant)' }}>
                                        {r.category_name} • {r.question_type?.toUpperCase()}
                                      </div>
                                      <div style={{ marginTop: 4 }}>
                                        <span style={{ background: 'var(--surface)', padding: '2px 6px', borderRadius: 4 }}>
                                          {r.response_text || '-'}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setShowResponsesModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Participants Modal */}
      {showAssignModal && (
        <div className="modal-overlay" onClick={() => setShowAssignModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px', maxHeight: '80vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h2>👥 Assign Participants</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAssignModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {assignError && <div className="alert alert-error">{assignError}</div>}
              {assignLoading ? (
                <div className="loading">Loading participants...</div>
              ) : (
                <div className="card" style={{ margin: 0 }}>
                  <div className="card-content" style={{ paddingTop: 'var(--space-sm)' }}>
                    <div style={{ overflowX: 'auto' }}>
                      <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: 'left' }}>Employee</th>
                            <th>Self</th>
                            <th>Manager</th>
                            <th>Reportee</th>
                            <th>Peer</th>
                          </tr>
                        </thead>
                        <tbody>
                          {assignEmployees.map(emp => (
                            <tr key={emp.id}>
                              <td style={{ padding: '8px 6px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span style={{ fontWeight: 500 }}>{emp.name}</span>
                                  <span style={{ fontSize: '0.8rem', color: 'var(--on-surface-variant)' }}>{emp.email}</span>
                                </div>
                              </td>
                              {['self','manager','reportee','peer'].map(ft => (
                                <td key={ft} style={{ textAlign: 'center' }}>
                                  <input
                                    type="checkbox"
                                    checked={(participantsByType[ft] || []).includes(emp.id)}
                                    onChange={() => toggleParticipant(ft, emp.id)}
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="card-actions" style={{ padding: 'var(--space-sm)', display: 'flex', gap: 'var(--space-sm)' }}>
                    <button className="btn btn-primary" onClick={saveAllParticipants}>💾 Save</button>
                  </div>
                </div>
              )}
              <div className="alert alert-info" style={{ marginTop: 'var(--space-md)' }}>
                Tip: Use the grid to assign roles per employee. Click "Save" to apply changes to all roles.
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setShowAssignModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
