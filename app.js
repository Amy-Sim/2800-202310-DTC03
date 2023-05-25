const express = require('express');
const nodemailer = require('nodemailer');
const { google } = require('googleapis');
const moment = require('moment');
const cron = require('node-cron');
const app = express();
const chatbot = require('./controller/chatbot');
const session = require('express-session');
const usersModel = require('./models/users');
const recipe = require('./models/recipe');
const ingredientsModel = require('./models/ingredients');
const MongoDBStore = require('connect-mongodb-session')(session);
const bcrypt = require('bcrypt');
const Joi = require('joi');
const url = require('url');
const bodyParser = require('body-parser');
// Add the body-parser middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
// 1 - import
let ejs = require('ejs');
// 2 - set the view engine to ejs
app.set('view engine', 'ejs');

const dotenv = require('dotenv');
const { error } = require('console');
dotenv.config();

const dbStore = new MongoDBStore({
  uri: `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_CLUSTER}/${process.env.MONGODB_DATABASE}?retryWrites=true&w=majority`,
  collection: 'mySessions',
  expires: 1000 * 60 * 60, // 60 minutes
});

const MongoClient = require('mongodb').MongoClient;
const uri = `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_CLUSTER}/${process.env.MONGODB_DATABASE}?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });


cron.schedule("03 1 * * *", async function() {
  console.log("Checking all users' pantries for expired items...");

  try {
    const users = await usersModel.find(
      { emailNotifications: 'checked' },
    );

    for (let user of users) {
      const expiredItems = [];

      for (let item of user.pantry) {
        if (moment().isAfter(item.bestBeforeDate)) {
          expiredItems.push(item);
        }
      }

      if (expiredItems.length > 0) {
        await sendMail(user, expiredItems);
      }
    }
  } catch (err) {
    console.log(err);
  }
});

async function sendMail(user, expiredItems) {
  let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: process.env.NODE_EMAIL_ADDRESS,
      clientId: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
      refreshToken: process.env.REFRESH_TOKEN,
      // accessToken: process.env.ACCESS_TOKEN,
    },
  });
  console.log('Transporter created')

  let info = await transporter.sendMail({
    from: process.env.NODE_EMAIL_ADDRESS,
    to: 'alfreychan@gmail.com',
    subject: 'Pantry Master - Expired Items in Your Pantry',
    text: `Dear ${user.name},\n\nThe following items in your pantry have expired:\n\n${expiredItems.map(item => `${item.food} - Best before: ${new Date(item.bestBeforeDate).toLocaleDateString('en-US')}`) .join('\n')}\n\nBest regards,\n\nPantryMaster\n\nThis is an automated message. Please do not reply to this email.\n\nDreamCrafters Team, creators of PantryMaster ©2023\nVisit our website: www.pantrymaster.cyclic.app`,
  });

   console.log('Message sent: %s', info.messageId)
}

app.use(
  session({
    secret: `${process.env.NODE_SESSION_SECRET}`,
    store: dbStore,
    resave: false,
    saveUninitialized: false,
  })
);

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use('/', (req, res, next) => {
  res.locals.session = req.session;
  app.locals.currentURL = url.parse(req.url).pathname;
  next();
});

// public routes
app.get('/', async (req, res) => {
  if (req.session.GLOBAL_AUTHENTICATED) {
    const checkDatesResult = await checkDates(req.session.loggedUsername);
    req.session.outdatedItemsMessage = checkDatesResult.message;

    console.log(checkDatesResult.hasOutdatedItems);
    try{
      await usersModel.updateOne(
        { username: req.session.loggedUsername },
        { $set: { hasOutdatedItems: checkDatesResult.hasOutdatedItems } }
      );
    } catch (err) {
      console.log(err);
    }

    req.session.save();
  }
  const user = await usersModel.findOne({
    username: req.session.loggedUsername,
  });

  res.render('index', {
    session: req.session,
    user: user,
  });
});

app.get('/signup', (req, res) => {
  res.render('signup', {session: req.session});
});

app.use(express.json());
app.post('/signupSubmit', async (req, res) => {
  let errorMessage = [];
  const schema = Joi.object({
    username: Joi.string().alphanum().min(5).max(15).required().messages({
      'string.alphanum': 'Username must only contain alphanumeric characters.',
      'string.min': 'Username must be between 5 to 15 characters long.',
      'string.max': 'Username must be betwen 5 to 15 characters long.',
      'string.empty': 'Please provide a username.',
    }),
    name: Joi.string().alphanum().min(5).max(15).required().messages({
      'string.alphanum': 'Name must only contain alphanumeric characters.',
      'string.min': 'Name must be between 5 to 15 characters long.',
      'string.max': 'Username must be betwen 5 to 15 characters long.',
      'string.empty': 'Please provide a name.',
    }),
    email: Joi.string()
      .email({ minDomainSegments: 2, tlds: { allow: ['com', 'net', 'ca', 'gov', 'edu', 'co', 'org'] } })
      .required()
      .messages({
        'string.email': 'Please provide a valid email address.',
        'string.empty': 'Please provide an email.',
      }),
    password: Joi.string().min(5).max(30).required().messages({
      'string.max': 'Password must be between 5 and 30 characters long.',
      'string.min': 'Password must be between 5 and 30 characters long.',
      'string.empty': 'Please provide a password.',
    }),
    confirmPassword: Joi.any().valid(Joi.ref('password')).required().messages({
      'any.only': 'Passwords do not match.',
    }),
    securityQuestion: Joi.string()
      .min(5)
      .max(30)
      .required()
      .messages({
        'string.min':
          'Security question must be between 5 and 30 characters long.',
        'string.max':
          'Security question must be between 5 and 30 characters long.',
        'string.empty': 'Please provide a security question.',
      }),
    securityAnswer: Joi.string().alphanum().min(5).max(30).required().messages({
      'string.max': 'Security answer must be between 5 and 30 characters long.',
      'string.min': 'Security answer must be between 5 and 30 characters long.',
      'string.empty': 'Please provide a security answer.',
    }),
  }).options({ allowUnknown: true });

  try {
  const { username, name, password, email, securityQuestion, securityAnswer } = await schema.validateAsync(req.body, { abortEarly: false });
  const hashedSecurityAnswer = await bcrypt.hash(securityAnswer, 10);
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = {
    username: username,
    name: name,
    password: hashedPassword,
    email: email,
    securityQuestion: securityQuestion,
    securityAnswer: hashedSecurityAnswer,
    type: 'user',
  };
  const result = await usersModel.create(user);
  console.log(result);
  // add some user created successfully message?
  req.session.GLOBAL_AUTHENTICATED = true;
  req.session.loggedUsername = req.body.username;
  req.session.loggedName = req.body.name;
  res.render('preference_cuisine', {
    result: result,
    session: req.session,
  });
} catch (err) {
  console.log(err);
  // catch all errors and add to error message array
  err.details.forEach(error => {
    errorMessage.push(error.message);
  });
  // render the error page with the error message array
  res.render('signup_submit_error', {
    errorMessage: errorMessage,
  });
  return;
}
});

app.use(express.static('public'));
// app.get('/preference_cuisine', (req, res) => {
//   const user = req.session.user;
//   res.render('preference_cuisine', { session: req.session });
// });

app.post('/preference_cuisine', async (req, res) => {
  const userId = req.body.userId;
  
  try {
    const user = await usersModel.findOne({ _id: userId });
    if (user) {
      // Update user's cuisine preference
      user.cuisinePreference = req.body.preferredCuisines;
      await user.save();
      console.log(user);
      req.session.user = user;
      }
    console.log("user's preferred cuisine", user.cuisinePreference);
    res.render('preference_dietary_restriction', {
      userId: userId,
      session: req.session,
    });
  } catch (error) {
    console.log(error);
  }
});

// app.get('/preference_dietary_restriction', (req, res) => {
//   const user = req.session.user;
//   res.render('preference_dietary_restriction', { session: req.session });
// });

app.post('/preference_dietary_restriction', async (req, res) => {
  const userId = req.body.userId;
  const dietaryRestrictions = req.body.dietaryRestrictions;

  try {
    const user = await usersModel.findOne({ _id: userId });
    if (user) {
      // Update user's dietary restrictions
      user.dietaryRestrictions = dietaryRestrictions;
      await user.save();
      req.session.user = user;
    }
    console.log("user's dietary restrictions", user.dietaryRestrictions);
    res.render('choose_persona', { userId: userId, session: req.session });
  } catch (error) {
    console.log(error);
  }
});

app.post('/choose_persona', async (req, res) => {
  const userId = req.body.userId;
  const persona = req.body.persona;

  try {
    const user = await usersModel.findOne({ _id: userId });
    if (user) {
      // Update user's persona preference in the database
      user.persona = persona;
      await user.save();
      req.session.user = user;
    }
    console.log("user's persona preference: ", user.persona);
    res.redirect('/');
  } catch (error) {
    console.log(error);
  }
});


app.get('/login', (req, res) => {
  res.render('login', {session: req.session});
});

app.post('/login', async (req, res) => {
  // sanitize the input using Joi
  const schema = Joi.object({
    password: Joi.string(),
  });

  try {
    const value = await schema.validateAsync({ password: req.body.password });
  } catch (err) {
    console.log(err);
    console.log('The password has to be a string');
  }

  try {
    const result = await usersModel.findOne({
      username: req.body.username
    });

    if (result && bcrypt.compareSync(req.body.password, result?.password)) {
      // set a global variable to true if the user is authenticated
      req.session.GLOBAL_AUTHENTICATED = true;
      req.session.loggedName = result.name;
      req.session.loggedUsername = result.username;
      req.session.loggedEmail = result.email;
      req.session.loggedPassword = result.password;
      req.session.securityQuestion = result.securityQuestion;
      req.session.securityAnswer = result.securityAnswer;
      req.session.emailNotifications = result.emailNotifications;
      req.session.save();
      res.redirect('/');
    } else {
      res.render('login_error', {});
    }
  } catch (error) {
    console.log(error);
  }
});

async function checkDates(currentUser) {
  const user = await usersModel.findOne({ username: currentUser });
  console.log(currentUser);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (user.pantry && Array.isArray(user.pantry)) {
    const outdatedItems = user.pantry.filter(item => {
      const bestBeforeDate = new Date(item.bestBeforeDate);
      bestBeforeDate.setHours(0, 0, 0, 0);
      console.log(`${item.food}, Outdated: ${bestBeforeDate < today}`)
      return bestBeforeDate < today;
    });

    return { hasOutdatedItems: outdatedItems.length > 0, message: "You have outdated items in your pantry!" };
  } else {
    return { hasOutdatedItems: false, message: "" };
  }
}

app.get('/username_retreival', (req, res) => {
  res.render('username_retreival', { session: req.session });
});

app.post('/display_username', async (req, res) => {
  const email = req.body.email;

  try {
    const user = await usersModel.findOne({ email: email });

    if (user) {
      res.render('username_retreival_view', {
        username: user.username,
        session: req.session,
      });
    } else {
      res.render('user_not_found', { session: req.session });
    }
  } catch (error) {
    console.log(error);
  }
});

app.get('/password_recovery', (req, res) => { 
  res.render('password_recovery', { session: req.session });
});

app.post('/submit_user_information', async (req, res) => {
  try {
    const user = await usersModel.findOne({
      username: req.body.username,
      email: req.body.email,
    });
    if (user) {
      res.render('security_answer_submit', {
        user: user,
        securityQuestion: user.securityQuestion,
      });
      console.log(user.securityAnswer);
      console.log(user);
    } else {
      res.render('password_change_error', { message: 'User not found.' });
    }
  } catch (error) {
    console.log(error);
  }
});

app.post('/submit_security_answer', async (req, res) => {
  try {
    const user = await usersModel.findOne({ _id: req.body.userId });
    if ( user && req.body.securityAnswer && user.securityAnswer &&bcrypt.compareSync(req.body.securityAnswer, user.securityAnswer)
    ) {
      req.session.loggedName = user.name;
      req.session.loggedUsername = user.username;
      req.session.loggedEmail = user.email;
      req.session.loggedPassword = user.password;
      req.session.securityQuestion = user.securityQuestion;
      req.session.securityAnswer = user.securityAnswer;

      // Set the req.session.user object
      req.session.user = { _id: user._id };

      res.render('password_change', { user: user, securityAnswer: user.securityAnswer });
    } else {
      res.render('security_question_error');
    }
  } catch (error) {
    console.log(error);
  }
});

app.get('/security_answer_submit', (req, res) => {
  res.render('security_answer_submit');
});

app.post('/reset_password', async (req, res) => {
  try {
    const { password, confirmPassword } = req.body;
    const schema = Joi.object({
      password: Joi.string().min(5).max(30).required().messages({
        'string.max': 'Password must be between 5 and 30 characters long.',
        'string.min': 'Password must be between 5 and 30 characters long.',
        'string.empty': 'Please provide a password.',
      }),
      confirmPassword: Joi.string()
        .valid(Joi.ref('password'))
        .required()
        .messages({
          'any.only': 'Passwords do not match.',
        }),
    });

    const { error } = await schema.validate({ password, confirmPassword });
    if (error) {
      const errorMessage = error.details[0].message;
      res.render('reset_password_error', {
        errorMessage: errorMessage,
      });
    } else {
      // Hash the new password
      const hashedPassword = await bcrypt.hash(password, 10);

      await usersModel.updateOne(
        { _id: req.session.user._id },
        { password: hashedPassword }
      );
      res.render('reset_password_success')
    }
  } catch (error) {
    console.log(error);
  }
});

app.get('/password_change', (req, res) => {
  res.render('password_change');
});

app.get('/profile', (req, res) => {
  res.render('profile', {session: req.session, disableFields: true});
});

app.post('/profileSubmit', async (req, res) => {
  const schema = Joi.object({
    name: Joi.string().alphanum().min(5).max(15).required().messages({
      'string.alphanum': 'Name must only contain alphanumeric characters.',
      'string.min': 'Name must be between 5 to 15 characters long.',
      'string.max': 'Name must be between 5 to 15 characters long.',
      'string.empty': 'Please provide a name.',
    }),
    email: Joi.string()
      .email({ minDomainSegments: 2, tlds: { allow: ['com', 'net', 'ca', 'gov', 'edu', 'co', 'org'] } })
      .required()
      .messages({
        'string.email': 'Please provide a valid email address.',
        'string.empty': 'Please provide an email.',
      }),
  }).options({ allowUnknown: true });

  try {
    // validate input
    const { name, email } = await schema.validateAsync(req.body, { abortEarly: false });
  
    // update user
    const updatedUser = await usersModel.findOneAndUpdate(
      { username: req.session.loggedUsername },
      { $set: { name: name, email: email } },
      { new: true }
    );
    console.log(updatedUser);
  
    // update session data
    req.session.loggedName = name;
    req.session.loggedEmail = email;
  
    // redirect to profile page
    res.redirect('/profile');
  } catch (err) {
    console.log(err);
    // pass error messages to response locals
    res.locals.errors = err.details.map((error) => ({
      message: error.message,
    }));
    // render the profile page with errors
    res.render('profile', { title: 'My Account', session: req.session, disableFields: false });
  }
  
});

app.get('/profile_change_password', (req, res) => {
  res.render('profile_change_password', {session: req.session});
});

app.post('/profile_change_password', async (req, res) => {
  const { old_password, password, confirmPassword } = req.body;
  const schema = Joi.object({
    old_password: Joi.string().required().messages({
      'string.empty': 'Please provide your old password.',
    }),
    password: Joi.string().min(5).max(30).required().messages({
      'string.max': 'Password must be between 5 and 30 characters long.',
      'string.min': 'Password must be between 5 and 30 characters long.',
      'string.empty': 'Please provide a password.',
    }),
    confirmPassword: Joi.string()
      .valid(Joi.ref('password'))
      .required()
      .messages({
        'any.only': 'Passwords do not match.',
      }),
  });

  const { error } = await schema.validate({ old_password, password, confirmPassword });
  if (error) {
    res.locals.errors = error.details.map((error) => ({
      message: error.message,
    }));
    // render the profile page with errors
    res.render('profile_change_password', { session: req.session });
  } else {
    // Verify old password
    const user = await usersModel.findOne({ username: req.session.loggedUsername });
    const passwordMatch = await bcrypt.compare(old_password, user.password);
    if (!passwordMatch) {
      res.locals.errors = [{ message: 'Old password is incorrect.' }];
      // render the profile page with errors
      res.render('profile_change_password', { session: req.session });
    } else {
      // Hash the new password
      const hashedPassword = await bcrypt.hash(password, 10);

      await usersModel.updateOne(
        { username: req.session.loggedUsername },
        { password: hashedPassword }
      );
      res.redirect('/profile');
    }
  }
});

app.post('/update-user-setting', async (req, res) => {
  const { emailNotifications } = req.body;

  await usersModel.updateOne(
    { username: req.session.loggedUsername },
    { $set: { emailNotifications: emailNotifications } }
  );
  console.log('Updated user email preferences.')

  // update session emailNotifications value
  req.session.emailNotifications = emailNotifications;

  res.status(200).send();
});

app.get('/aboutus', (req, res) => {
  const user = req.session.user;
  res.render('about_us', { session: req.session });
});

app.get('/preference', async (req, res) => {
  if (!req.session.GLOBAL_AUTHENTICATED) {
    res.redirect('/');
  } else {
    const user = await usersModel.findOne({ username: req.session.loggedUsername });
    const cuisineOptions = ['European', 'Korean', 'Greek', 'Mexican', 'Thai', 'Indian', 'Chinese', 'Brazilian', 'Japanese'];
    const dietaryOptions = ['Nut-Free', 'Lactose Free', 'Vegan', 'Yeast-Free',];
    const persona = ["Whisker", "Grandma", "Chef Ramsay", "Remy"]
    res.render('preference', {
      session: req.session,
      user: user,
      cuisineOptions: cuisineOptions,
      dietaryOptions: dietaryOptions,
      persona: persona
    });
  }
});

app.post('/preference', async (req, res) => {
  const userId = req.body.userId;
  const cuisinePreference = req.body.cuisinePreference;
  const dietaryRestrictions = req.body.dietaryRestrictions;
  const updatedPersona = req.body.persona;

  try {
    const user = await usersModel.findOne({ _id: userId });
    if (user) {
      // Update user's persona, cuisine preference, and dietary restrictions
      user.cuisinePreference = cuisinePreference;
      user.dietaryRestrictions = dietaryRestrictions;
      user.persona = updatedPersona;
      await user.save();
      req.session.user = user;
    }
    console.log(user);
    console.log("User's cuisine preference:", user.cuisinePreference);
    console.log("User's dietary restrictions:", user.dietaryRestrictions);
    console.log("User's persona:", user.persona);
    res.render('preference', {
      session: req.session,
      user: user,
      cuisineOptions: ['European', 'Korean', 'Greek', 'Mexican', 'Thai', 'Indian', 'Chinese', 'Brazilian', 'Japanese'],
      dietaryOptions: ['Nut-Free', 'Lactose Free', 'Vegan', 'Yeast-Free'],
      persona: ["Whisker", "Grandma", "Chef Ramsay", "Remy"] });
  } catch (error) {
    console.log(error);
  }
});

// Route for recipe page
app.get('/recipe', async (req, res) => {
  try {
    const userEmail = req.session.loggedEmail;
    const user = await usersModel.findOne({ email: userEmail });
    const cuisinePreference = user.cuisinePreference;
    const dietaryRestrictions = user.dietaryRestrictions;
    const pantryItems = user.pantry.map(item => item.food.toLowerCase());
    const collection = client.db('PantryMaster').collection('recipeData');

    const filter = {};

    // Filter by dietary restrictions
    if (dietaryRestrictions && dietaryRestrictions.length > 0) {
      filter.$and = dietaryRestrictions.map(keyword => ({
        $and: [
          { Keywords: new RegExp(keyword, 'i') },
          {
            $or: [
              { Keywords: { $regex: /Nut-Free/i } },
              { Keywords: { $regex: /Lacto Free/i } },
              { Keywords: { $regex: /Vegan/i } },
              { Keywords: { $regex: /Yeast-Free/i } }
            ]
          }
        ]
      }));
    }    

    // Filter by cuisine preference
    if (cuisinePreference) {
      if (!filter.$or) {
        filter.$or = [];
      }
      filter.$or.push({ Keywords: { $in: cuisinePreference.map(keyword => new RegExp(keyword, 'i')) } });
    }

    // Filter by pantry items
    if (pantryItems.length > 0) {
      if (!filter.$or) {
        filter.$or = [];
      }
      filter.$or.push({ 'RecipeIngredientParts.food': { $in: pantryItems.map(item => new RegExp(item, 'i')) } });
    }

    // Check if there is a search query parameter
    const searchQuery = req.query.search;
    if (searchQuery) {
      const searchFilter = { Name: { $regex: new RegExp(searchQuery, 'i') } };
      filter.$or.unshift(searchFilter);
    }

    const recipes = await collection.find(filter).toArray();

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const pageSize = 10;
    const startIndex = (page - 1) * pageSize;
    const endIndex = page * pageSize;
    const totalPages = Math.ceil(recipes.length / pageSize);

    // If on the first page and search query exists, move all search results to the first page
    if (page === 1 && searchQuery && recipes.length > 1) {
      const searchResults = recipes.filter(recipe => recipe.Name.toLowerCase().includes(searchQuery.toLowerCase()));
      const paginatedSearchResults = searchResults.slice(0, pageSize);
      const remainingSpace = pageSize - paginatedSearchResults.length;
      const paginatedNonSearchResults = recipes.slice(paginatedSearchResults.length, paginatedSearchResults.length + remainingSpace);
      const paginatedRecipes = paginatedSearchResults.concat(paginatedNonSearchResults);
      res.render('recipe', { paginatedRecipes, currentPage: page, totalPages });
    } else {
      const paginatedRecipes = recipes.slice(startIndex, endIndex);
      res.render('recipe', { paginatedRecipes, currentPage: page, totalPages });
    }

    // If there are no search results, display a pop-up alert
    if (searchQuery && recipes.length === 0) {
      const noResultsMessage = 'There are no search results.';
      res.send(`<script>alert("${noResultsMessage}"); window.history.back();</script>`);
      return; // Add this return statement to exit the route after sending the alert
    }
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('An error occurred while retrieving recipes.');
  }
});



app.use(express.static('public'));

app.get('/pantry', async (req, res) => {
  if (!req.session.GLOBAL_AUTHENTICATED) {
    res.redirect('/');
  } else {
      const user = await usersModel.findOne({username: req.session.loggedUsername});
      const ingredients = await ingredientsModel.find();
      let lastCategory = ingredients.pop();
      ingredients.unshift(lastCategory);
      res.render('pantry', {
        session: req.session,
        pantryItems: user.pantry,
        username: req.session.loggedUsername,
        ingredients: ingredients
      });
  }
});

app.post('/update-pantry', async (req, res) => {
  const { username, pantryItems } = req.body;
  console.log(pantryItems);
  try {
    const user = await usersModel.findOneAndUpdate(
      {username: username}, 
      { $push: { pantry: { $each: pantryItems } } },
      { new: true }
    );

    if (!user) {
      res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({ message: 'Pantry updated' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


app.post('/remove-from-pantry', async (req, res) => {
  const { username, itemsToRemove } = req.body;
  console.log("test");
  console.log(itemsToRemove);
  try {
    // Retrieve user from the database
    const user = await usersModel.findOne({ username: username });
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    console.log(itemsToRemove);
    // Filter out the items to be removed
    user.pantry = user.pantry.filter(item => !itemsToRemove.includes(item.food));

    // Save updated user
    await user.save();

    res.status(200).json({ message: 'Successfully removed items from pantry.' });
  } catch (err) {
    res.status(500).json({ message: 'An error occurred while removing items from pantry.', error: err });
  }
});

app.post('/update-best-before-date', async (req, res) => {
  const { username, foodName, bestBeforeDate } = req.body;

  try {
    // Retrieve user from the database
    const user = await usersModel.findOne({ username: username });
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Update the best before date of the specified food item
    for (let item of user.pantry) {
      if (item.food === foodName) {
        item.bestBeforeDate = bestBeforeDate;
        break;
      }
    }

    // Save updated user
    await user.save();

    res.status(200).json({ message: 'Successfully updated best before date.' });
  } catch (err) {
    res.status(500).json({ message: 'An error occurred while updating best before date.', error: err });
  }
});


app.get('/chat', async (req, res) => {
  if (!req.session.GLOBAL_AUTHENTICATED) {
    res.redirect('/');
  } else {
      // res.render('chat', {persona: "Whisker"});
      const user = await usersModel.findOne({ username: req.session.loggedUsername });
      res.render('chat', {persona: user.persona})
  }
});

app.post('/chat', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const user = await usersModel.findOne({username: req.session.loggedUsername});
  const pantryItems = user.pantry;
  console.log(pantryItems);
  let foodList = [];
  for (items of pantryItems) {
    foodList.push(items.food);
  }
  const query = `I have the following items in my pantry: ${foodList.toString()}.  ${req.body.query}`;
  const persona = req.body.persona;
  console.log(query);
  res.send(await chatbot(persona, query))

});


app.get('/does_not_exist', (req, res) => {
  res.status(404).render('404', {session: req.session});
});

app.use(express.static('public'));

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

app.use((req, res) => {
  res.redirect('/does_not_exist');
});

module.exports = app;
