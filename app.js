const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;
const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Sever is starting at http://localhost:3000");
    });
  } catch (e) {
    console.log(`DB Error:${e.message}`);
  }
};

initializeDbAndServer();
const convertToPascalCase = (each) => {
  return {
    username: each.username,
    tweet: each.tweet,
    dateTime: each.date_time,
  };
};

//Register API (1)

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const checkUserQuery = `SELECT *
                        FROM user
                        WHERE username = '${username}';`;
  const checkUser = await db.get(checkUserQuery);
  if (checkUser === undefined) {
    if (password.length > 6) {
      const createUserQuery = `INSERT INTO user(username,password, name, gender)
                                VALUES('${username}','${hashedPassword}','${name}','${gender}');`;
      const createUser = await db.run(createUserQuery);
      response.status(200);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.delete("/register/", async (request, response) => {
  const { username } = request.query;
  const deleteUserQuery = `DELETE FROM user
    WHERE username = '${username}';`;
  const deleteUser = await db.run(deleteUserQuery);
  response.send("Deleted");
});

//Login API (2)

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;

  const checkUserQuery = `SELECT *
                        FROM user
                        WHERE username = '${username}';`;
  const checkUser = await db.get(checkUserQuery);

  if (checkUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      checkUser.password
    );
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "nnmmii");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// Authenticate Token

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHead = request.headers["authorization"];
  if (authHead !== undefined) {
    jwtToken = authHead.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "nnmmii", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

//API 3

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const latestTweetsQuery = `SELECT username,tweet,date_time
                                FROM user Inner Join tweet 
                                on user.user_id = tweet.user_id
                                ORDER BY tweet.date_time DESC
                                LIMIT 4;`;
  const latestTweets = await db.all(latestTweetsQuery);
  response.send(latestTweets.map((each) => convertToPascalCase(each)));
});

//API 4

app.get("/user/following/", authenticateToken, async (request, response) => {
  const userFollowedListQuery = `SELECT username
                                    FROM user Inner Join follower
                                    on user.user_id = follower.following_user_id
                                    GROUP BY username;`;
  const userFollowedList = await db.all(userFollowedListQuery);
  response.send(userFollowedList);
});

//API 5

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const userFollowingListQuery = `SELECT username
                                    FROM user Inner Join follower
                                    on user.user_id = follower.follower_user_id
                                    GROUP BY username;`;
  const userFollowingList = await db.all(userFollowingListQuery);
  response.send(userFollowingList);
});

//API 6

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const getTweetDetailsQuery = `SELECT tweet.tweet,count(like.like_id),count(reply.reply_id),F3.date_time
                                    FROM user Inner Join follower on user.user_id = follower.follower_user_id AS F1
                                    Inner Join tweet on F1.user_id = tweet.user_id AS F2 Inner Join reply on
                                    F2.user_id = reply.user_id AS F3 Inner Join like on F3.user_id = like.user_id
                                    WHERE F3.tweet_id = ${tweetId}
                                    GROUP BY tweet_id;`;
  const getTweetDetails = await db.get(getTweetDetailsQuery);
  console.log(getTweetDetails);
});

//API 7

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
  }
);
