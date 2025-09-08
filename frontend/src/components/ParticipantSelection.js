import React from 'react';

// This component is not currently wired into SurveyCreator.
// Participant management now lives under the Creator "Participants" tab (EmployeeManager).
export default function ParticipantSelection() {
	return (
		<div className="card" style={{ padding: 'var(--space-lg)' }}>
			<h3 className="card-title">Participants</h3>
			<p className="card-subtitle">Use the Participants tab to add and manage employees.</p>
		</div>
	);
}
