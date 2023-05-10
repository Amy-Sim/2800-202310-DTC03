const express = require('express');
const app = express();
const session = require('express-session');
const usersModel = require('./models/users');
const MongoDBStore = require('connect-mongodb-session')(session);
const bcrypt = require('bcrypt');
const Joi = require('joi')
const url = require('url');
// 1 - import
let ejs = require('ejs');
// 2 - set the view engine to ejs
app.set('view engine', 'ejs')

const navLinks = [
  { label: 'Home', path: '/' },
  { label: 'Sign Up', path: '/signup' },
  { label: 'Login', path: '/login' }
]

const dotenv = require('dotenv');
const { error } = require('console');
dotenv.config();

const dbStore = new MongoDBStore({
  uri: `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_CLUSTER}/${process.env.MONGODB_DATABASE}?retryWrites=true&w=majority`,
  collection: 'mySessions',
  expires: 1000 * 60 * 60 // 60 minutes
})

app.use(session({
  secret: `${process.env.NODE_SESSION_SECRET}`,
  store: dbStore,
  resave: false,
  saveUninitialized: false
}));

app.use(express.urlencoded({ extended: false }))
app.use(express.json())

app.use("/", (req, res, next) => {
  app.locals.navLinks = navLinks;
  app.locals.currentURL = url.parse(req.url).pathname;
  next();
});

// public routes
app.get('/', (req, res) => {
  res.render('index', {
    session: req.session
  });
});

app.get('/signup', (req, res) => {
  res.render('signup', {
  });
});

app.use(express.json());
app.post('/signupSubmit', async (req, res) => {
  let errorMessage = [];
  const schema = Joi.object({
    username: Joi.string()
    .alphanum()
    .min(5)
    .max(15)
    .required()
    .messages({
      'string.alphanum': 'Username must only contain alphanumeric characters.',
      'string.min': 'Username must be between 5 to 15 characters long.',
      'string.max': 'Username must be betwen 5 to 15 characters long.',
      'string.empty': 'Please provide a username.'
    }),
    name: Joi.string()
    .alphanum()
    .min(5)
    .max(15)
    .required()
    .messages({
      'string.alphanum': 'Name must only contain alphanumeric characters.',
      'string.min': 'Name must be between 5 to 15 characters long.',
      'string.max': 'Username must be betwen 5 to 15 characters long.',
      'string.empty': 'Please provide a name.'
    }),
    email: Joi.string()
    .email({ minDomainSegments: 2, tlds: { allow: ['com', 'net'] } })
    .required()
    .messages({
      'string.email': 'Please provide a valid email address.',
      'string.empty': 'Please provide an email.'
    }),
    password: Joi.string()
    .min(5)
    .max(30)
    .required()
    .messages({
      'string.max': 'Password must be between 5 and 30 characters long.',
      'string.min': 'Password must be between 5 and 30 characters long.',
      'string.empty': 'Please provide a password.'
    }),
    confirmPassword: Joi.any().valid(Joi.ref('password'))
    .required()
    .messages({
      'any.only': 'Passwords do not match.',
    }),
  }).options({ allowUnknown: true });

  try {
    const { username, password, email } = await schema.validateAsync(req.body, { abortEarly: false });
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = {
      username: username,
      password: hashedPassword,
      email: email,
      type: 'user',
    };
    const result = await usersModel.create(user);
    console.log(result);
    // add some user created successfully message?
  } catch (err) {
    console.log(err);
    // catch all errors and add to error message array
    err.details.forEach(error => {
      errorMessage.push(error.message);
    });
    // render the error page with the error message array
    res.render('signupSubmitError', {
      errorMessage: errorMessage,
    });
    return;
  }
  req.session.GLOBAL_AUTHENTICATED = true;
  req.session.loggedUsername = req.body.username;
  res.redirect('/')
});

  // if (!req.body.username) {
  //   errorMessage.push('Username is required.');
  // }

  // if (!req.body.name) {
  //   errorMessage.push('Name is required.');
  // }
  
  // if (!req.body.email) {
  //   errorMessage.push('Email is required.');
  // }
  
  // if (!req.body.password) {
  //   errorMessage.push('Password is required.');
  // }

  // if (!req.body.confirmPassword) {
  //   errorMessage.push('Please confirm your password.');
  // } else if (req.body.password !== req.body.confirmPassword) {
  //     errorMessage.push('Passwords do not match.');
  // }
  
  // if (errorMessage.length > 0) {
  //   res.render('signupSubmitError', {
  //     errorMessage: errorMessage,
  //   });
  //   return;
  // } else {
  //   const schema = Joi.object({
  //     username: Joi.string().alphanum().min(5).max(15).required()
  //     .messages({
  //       'string.alphanum': 'Username must only contain alphanumeric characters.',
  //       'string.min': 'Username must be between 5 to 15 characters long.',
  //       'string.max': 'Username must be betwen 5 to 15 characters long.',
  //       'string.empty': 'Please provide a username.'
  //     }),
  //     name: Joi.string().alphanum().min(5).max(15).required()
  //     .messages({
  //       'string.alphanum': 'Name must only contain alphanumeric characters.',
  //       'string.min': 'Name must be between 5 to 15 characters long.',
  //       'string.max': 'Username must be betwen 5 to 15 characters long.',
  //       'string.empty': 'Please provide a name.'
  //     }),
  //     email: Joi.string().required()
  //     .messages({
  //       'string.empty': 'Please provide an email.'
  //     }),
  //     password: Joi.string().min(5).max(30).required()
  //     .messages({
  //       'string.max': 'Password must be between 5 and 30 characters long.',
  //       'string.empty': 'Please provide a password.'
  //     })
  //   });

    // try {
    //   await schema.validateAsync({
    //     username: req.body.username,
    //     name: req.body.name,
    //     email: req.body.email,
    //     password: req.body.password
    //   });
    // } catch (err) {
    //   // errorMessage.push('The fields must all be strings!');
    //   console.log(err)
    //   err.details.forEach(error => {
    //     errorMessage.push(error.message);
    //     console.log(errorMessage)
    //   });
    //   // errorMessage.push(err.details[0].message);
    //   console.log(errorMessage);
    //   res.render('signupSubmitError', {
    //     errorMessage: errorMessage,
    //   });
    //   return;
    // }

//     await usersModel.create({
//       username: req.body.username,
//       name: req.body.name,
//       email: req.body.email,
//       password: bcrypt.hashSync(req.body.password, 10)
//     }).catch((error) => {
//       errorMessage.push('Failed to sign up.');
//       res.render('signupSubmitError', {
//         errorMessage: errorMessage,
//       });
//     });
//     req.session.GLOBAL_AUTHENTICATED = true;
//     req.session.loggedUsername = req.body.username;
//     res.redirect('/')
//   }
// });

app.get('/login', (req, res) => {
  res.render('login', {
  });
});

app.post('/login', async (req, res) => {
  // sanitize the input using Joi
  const schema = Joi.object({
    password: Joi.string()
  });

  try {
    const value = await schema.validateAsync({password: req.body.password})
  } catch (err) {
    console.log(err);
    console.log("The password has to be a string");
  }

  try {
    const result = await usersModel.findOne({
        username: req.body.username
    });
        
    if(result && bcrypt.compareSync(req.body.password, result?.password)) {
      // set a global variable to true if the user is authenticated
      req.session.GLOBAL_AUTHENTICATED = true;
      req.session.loggedName = result.name;
      req.session.loggedUsername = req.body.username;
      req.session.loggedEmail = req.body.email;
      req.session.loggedPassword = req.body.password;
      res.redirect('/');
    } else {
      res.render('loginError', {
      });
    }
  } catch (error) {
    console.log(error);
  }
});

app.get('/does_not_exist', (req, res) => {
  res.status(404).render('404', {
  });
});

app.use(express.static('public'))

  
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

app.use((req, res) => {
  res.redirect('/does_not_exist');
});

module.exports = app;
