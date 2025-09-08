const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./survey.db');

db.serialize(() => {
  // Get the MCQ question ID
  db.get("SELECT id FROM survey_questions WHERE question_text LIKE '%decision-making%'", (err, row) => {
    if (err) {
      console.error(err);
      db.close();
      return;
    }
    
    if (row) {
      console.log('Question ID:', row.id);
      
      // Add options for the MCQ
      const options = [
        'Excellent',
        'Good', 
        'Average',
        'Needs Improvement',
        'Poor'
      ];
      
      let completed = 0;
      options.forEach((option, index) => {
        db.run("INSERT INTO survey_question_options (question_id, option_text, position) VALUES (?, ?, ?)", 
               [row.id, option, index], 
               function(err) {
          if (err) {
            console.error('Option error:', err);
          } else {
            console.log('Added option:', option);
          }
          
          completed++;
          if (completed === options.length) {
            console.log('All options added successfully');
            db.close();
          }
        });
      });
    } else {
      console.log('Question not found');
      db.close();
    }
  });
});
