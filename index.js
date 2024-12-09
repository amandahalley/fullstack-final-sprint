const express = require('express');
const expressWs = require('express-ws');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcrypt');

const PORT = 3000;
//TODO: Update this URI to match your own MongoDB setup
const MONGO_URI = 'mongodb://localhost:27017/FinalSprint';
const app = express();
expressWs(app);
const SALT_ROUNDS = 10;

const userSchema = new mongoose.Schema({
    username: {type: String, required: true},
    password: {type: String, required: true}
})

const pollSchema = new mongoose.Schema({
    question: {type: String, required: true},
    options: [{
        answer: {type: String, required: true},
        votes: {type: Number, required: true, default: 0}
    }]
});


const User = mongoose.model('User', userSchema);
const Polls = mongoose.model('Poll', pollSchema);


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(session({
    secret: 'voting-app-secret',
    resave: false,
    saveUninitialized: false,
}));
let connectedClients = [];

//Note: Not all routes you need are present here, some are missing and you'll need to add them yourself.

app.ws('/ws', (socket, request) => {
    connectedClients.push(socket);

    socket.on('message', async (message) => {
        const data = JSON.parse(message);
        
    });
    //This should remove disconnected client
    socket.on('close', async () => {
        connectedClients = connectedClients.filter(client => client !== socket);
        
    });
});

app.get('/', async (request, response) => {

    if (request.session.user?.id) {
        return response.redirect('/dashboard');
    }

    //get polls from mongo database
    const totalPolls = await Polls.countDocuments();

    response.render('index/unauthenticatedIndex', {totalPolls, session: request.session});
});

app.get('/login', async (request, response) => {
    response.render("login");
});

app.post('/login', async (request, response) => {
    const {username, password} = request.body;

    //checks if username exists
    const user = await User.findOne({username});
    if (!user) {
        return response.render('login', {errorMessage: "Username does not exist, please try again."});
    }

    //checks if password is correct
    const passwordCorrect = await bcrypt.compare(password, user.password);
    if (!passwordCorrect) {
        return response.render('login', {errorMessage: "Invalid password."})
    }

    //redirects to authenticatedIndex if username and password is correct.
    request.session.user = {id: user._id, username: user.username}
    response.redirect('/authenticatedIndex');
});

app.get('/authenticatedIndex', async (request, response) => {
    //check if user is logged in, redirect to home page if not
    if (!request.session.user?.id) {
        return response.redirect('/');
    }
    //get all polls and display them
    const polls = await Polls.find();
    response.render('index/authenticatedIndex', { polls, session: request.session });
});

//Log out
app.post('/logout', async (request, response) => {
    request.session.destroy(() => {
        response.redirect("/");
    });
});

app.get('/signup', async (request, response) => {
    if (request.session.user?.id) {
        return response.redirect('/dashboard');
    }

    return response.render('signup', { errorMessage: null });
});

app.post('/signup', async (request, response) => {
    const {username, password} = request.body;
    console.log('Username:', username);
    console.log('Password:', password);

    //check for existing username
    const userExists = await User.findOne({ username});
    if (userExists) {
        return response.status(400).render('Signup', {errorMessage: "Username already exists."})
    }

    try {
        //hash password with SALT_ROUNDS
        const hashPassword = await bcrypt.hash(password, SALT_ROUNDS);

        //create & save the new user
        const newUser = new User({username, password: hashPassword});
        await newUser.save();
        request.session.user = {id: newUser._id, username: newUser.username};

        //Redirect to dashboard once created
        response.redirect('/dashboard');
    } catch (error) {
        console.error("Signup error: ", error);
        response.status(500).render('signup', {errorMessage: "Server error"})
    }

});

app.get('/dashboard', async (request, response) => {
    if (!request.session.user?.id) {
        return response.redirect('/');
    }

    try {
        const polls = await Polls.find();

        return response.render('index/authenticatedIndex', {
            polls: polls,
            user: request.session.user
        });
    } catch (error) {
        console.error("Error getting polls", error);
        response.status(500).send("Error getting polls");
    }
});

app.post('/dashboard', async (request, response) => {
    if (!request.session.user?.id) {
        return response.redirect("/");
    }

    const { question, options } = request.body;
    const optionsArray = options.split(',').map(option => ({
        answer: option.trim(),
    }));

    try {
        const newPoll = new Polls({
            question, 
            options: optionsArray,
            creator: request.session.user.id
        });

        await newPoll.save();
        response.redirect('/dashboard');
    } catch (error) {
        console.error("Error creating poll", error);
        response.status(500).send("Error creating poll");
    }
});

app.get('/profile', async (request, response) => {
    
});

app.get('/createPoll', async (request, response) => {
    if (!request.session.user?.id) {
        return response.redirect('/');
    }

    return response.render('createPoll')
});

// Poll creation
app.post('/createPoll', async (request, response) => {
    const { question, options } = request.body;
    const formattedOptions = Object.values(options).map((option) => ({ answer: option, votes: 0 }));

    //checks at least to options are provided and question
    if (!question || !options || Object.keys(options).length < 2 ) {
        return response.render('createPoll', {errorMessage: "Must contain a question and at least 2 options."})
    }

    //sends error message if error occurs creating poll and redirects to dashboard
    const pollCreationError = onCreateNewPoll(question, formattedOptions);
    if (pollCreationError) {
        return response.render('createPoll', {errorMessage: "Error creating poll.", session: request.session});
    }
    response.redirect('/authenticatedIndex');
});

app.post('/vote', async (request, response) => {
    const { pollId, option } = request.body;

    try {
        const poll = await Polls.findById(pollId);
        if (!poll) {
            return response.status(404).send('Poll not found');
        }

        const error = await onNewVote(pollId, option);
        if (error) {
            return response.status(500).send(error);
        }

        response.redirect('/authenticatedIndex');
    } catch (error) {
        console.error('Error handling vote:', error);
        response.status(500).send('Error processing your vote');
    }
});


mongoose.connect(MONGO_URI)
    .then(() => app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`)))
    .catch((err) => console.error('MongoDB connection error:', err));

/**
 * Handles creating a new poll, based on the data provided to the server
 * 
 * @param {string} question The question the poll is asking
 * @param {[answer: string, votes: number]} pollOptions The various answers the poll allows and how many votes each answer should start with
 * @returns {string?} An error message if an error occurs, or null if no error occurs.
 */
async function onCreateNewPoll(question, pollOptions) {
    try {
        const newPoll = new Polls ({
            question,
            options: pollOptions
        });
        //save poll to database
        await newPoll.save();
        return true; //if creation was successfull
    }
    catch (error) {
        console.error(error);
        return "Error creating the poll, please try again";
    }
}

/**
 * Handles processing a new vote on a poll
 * 
 * This function isn't necessary and should be removed if it's not used, but it's left as a hint to try and help give
 * an idea of how you might want to handle incoming votes
 * 
 * @param {string} pollId The ID of the poll that was voted on
 * @param {string} selectedOption Which option the user voted for
 */
async function onNewVote(pollId, selectedOption) {
    try {
        // Find the poll by its ID
        const poll = await Polls.findById(pollId);
        if (!poll) {
            return 'Poll not found';
        }

        // Find the specific option to update
        const optionToUpdate = poll.options.find(opt => opt.answer === selectedOption);
        if (!optionToUpdate) {
            return 'Option not found';
        }

        // Increment the votes for the selected option
        optionToUpdate.votes += 1;

        // Save the updated poll to the database
        await poll.save();

        // Notify all connected clients about the vote update
        connectedClients.forEach(client => {
            client.send(JSON.stringify({ type: 'voteUpdate', pollId, updatedOptions: poll.options }));
        });

        return null; // No error
    } catch (error) {
        console.error('Error updating vote:', error);
        return 'Error updating the vote. Please try again.';
    }
}



//Connection to mongo database
mongoose.connect(MONGO_URI)
    .then(() => console.log("Connected to MongoDB"))
    .catch(err => console.error("Error connecting to MongoDB:", err));