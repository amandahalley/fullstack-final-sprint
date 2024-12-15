// Establish a WebSocket connection to the server
const socket = new WebSocket('ws://localhost:3000/ws');

// Listen for messages from the server
socket.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);

    console.log("test");
    if (data.type === "newPoll") {
        onNewPollAdded(data);
    } else if (data.type === "voteUpdate") {
        console.log("testing: frontEnd: voteUpdate");
        onIncomingVote(data);
    }

    //TODO: Handle the events from the socket
});


/**
 * Handles adding a new poll to the page when one is received from the server
 * 
 * @param {*} data The data from the server (ideally containing the new poll's ID and it's corresponding questions)
 */
function onNewPollAdded(data) {
    
    //get container where polls are displayed, create new div for new poll
    const pollContainer = document.getElementById('polls');
    const newPoll = document.createElement('div');
    //class for styling
    newPoll.classList.add('poll');
    //set innerHtml of new poll
    newPoll.innerHTML = `
    <h3>${data.question}</h3>
    <form class="poll-form">
        ${data.options.map(option => `
            <label>
                <input type="radio" name="answer" value="${option.answer}">
                ${option.answer}
            </label>
        `).join('')}
        <input type="hidden" name="pollId" value="${data.id}">
        <button type="submit">Vote</button>
    </form>
`;
    pollContainer.appendChild(newPoll);

    //TODO: Add event listeners to each vote button. This code might not work, it depends how you structure your polls on the poll page. However, it's left as an example 
    //      as to what you might want to do to get clicking the vote options to actually communicate with the server
    newPoll.querySelectorAll('.poll-form').forEach((pollForm) => {
        console.log("testing: trying to add event listener to polls");
        newPoll.setAttribute('id', data.id);
        pollForm.addEventListener('submit', onVoteClicked);
    });
}

// Function to send the vote to the server
function sendVote(pollId, selectedOption) {
    const userId = sessionStorage.getItem('userId'); // Get the userId from sessionStorage
    if (!userId) {
        console.error('User ID is not set');
        return; // Stop execution if the user is not logged in or userId is missing
    }
    
    socket.send(JSON.stringify({
        type: 'vote',
        pollId,
        option: selectedOption,
        username: username // Include userId in the message sent to the server
    }));
}

/**
 * Handles updating the number of votes an option has when a new vote is recieved from the server
 * 
 * @param {*} data The data from the server (probably containing which poll was updated and the new vote values for that poll)
 */
function onIncomingVote(data) {
    //check if pollId and updatedOptions exist
    if (!data.pollId || !Array.isArray(data.updatedOptions)) {
        console.error("Invalid poll data:", data);
        return;
    }

    const pollId = data.pollId;
    const updatedOptions = data.updatedOptions;
    
    const pollElement = document.getElementById(pollId);

    //if poll element exists, find container that holds the options, clearing existing options befor updating poll count
    if (pollElement) {
        let optionsContainer = pollElement.querySelector(".poll-options");
        optionsContainer.innerHTML = '';

        //loop through options displaying each option
        updatedOptions.forEach(({ answer, votes }) => {
            optionsContainer.innerHTML += `<li><strong>${answer}:</strong> ${votes} votes</li>`;
        });

        console.log("Vote updated for pollId: " + pollId);
    } else {
        console.error("Poll with ID " + pollId + " not found on the page.");
    }
}



/**
 * Handles processing a user's vote when they click on an option to vote
 * 
 * @param {FormDataEvent} event The form event sent after the user clicks a poll option to "submit" the form
 */
function onVoteClicked(event) {
    //Note: This function only works if your structure for displaying polls on the page hasn't changed from the template. If you change the template, you'll likely need to change this too
    event.preventDefault();
    const formData = new FormData(event.target);

    const pollId = formData.get("pollId");
    const selectedOption = event.submitter.value;
    
    //TOOD: Tell the server the user voted
    console.log(`Poll ID: ${pollId}, Selected Option: ${selectedOption}`);
    socket.send(JSON.stringify({type: 'vote', pollId, option: selectedOption}));
}

//Adds a listener to each existing poll to handle things when the user attempts to vote
document.querySelectorAll('.poll-form').forEach((pollForm) => {
    pollForm.addEventListener('submit', onVoteClicked);
});


