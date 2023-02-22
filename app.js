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
                                FROM (follower Inner Join tweet 
                                on follower.following_user_id = tweet.user_id) AS T
                                Inner Join user on T.user_id = user.user_id
                                
                                ORDER BY tweet.date_time DESC
                                LIMIT 4;`;
  const latestTweets = await db.all(latestTweetsQuery);
  response.send(latestTweets.map((each) => convertToPascalCase(each)));
});

//API 4

app.get("/user/following/", authenticateToken, async (request, response) => {
  const userFollowedListQuery = `SELECT username
                                    FROM user Inner Join follower
                                    on user.user_id = follower.follower_user_id
                                    GROUP BY username;`;
  const userFollowedList = await db.all(userFollowedListQuery);
  response.send(userFollowedList);
});

//API 5

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const userFollowingListQuery = `SELECT username
                                    FROM user Inner Join follower
                                    on user.user_id = follower.following_user_id
                                    GROUP BY username;`;
  const userFollowingList = await db.all(userFollowingListQuery);
  response.send(userFollowingList);
});

//API 6

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const checkUserFollowedQuery = `SELECT *
                                    FROM user Inner Join follower on user.user_id = follower.follower_user_id;`;
  const checkUserFollowed = await db.get(checkUserFollowedQuery);
  if (checkUserFollowed !== undefined) {
    const getTweetDetailsQuery = `SELECT tweet,count(like_id),count(reply_id),date_time
                                    FROM user Inner Join follower AS F1 on user.user_id = F1.follower_user_id 
                                    Inner Join tweet AS F2 on F2.user_id = F2.user_id  Inner Join reply AS F3 on
                                    F2.user_id = F3.user_id  Inner Join like AS F4 on F3.user_id = F4.user_id
                                    WHERE F4.tweet_id = ${tweetId}
                                    GROUP BY F4.tweet_id;`;
    const getTweetDetails = await db.get(getTweetDetailsQuery);
    response.send(getTweetDetails);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//API 7

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const checkUserFollowedQuery = `SELECT *
                                    FROM user Inner Join follower on user.user_id = follower.follower_user_id;`;
    const checkUserFollowed = await db.get(checkUserFollowedQuery);
    if (checkUserFollowed !== undefined) {
      const getUsernameLikedQuery = `SELECT username
                                        FROM user Inner Join like AS T1 on user.user_id = T1.user_id
                                        Inner Join tweet AS T2 on T1.user_id = T2.user_id
                                        WHERE T2.tweet_id = ${tweetId}
                                        GROUP BY username;`;
      const getUsernamesLiked = await db.all(getUsernameLikedQuery);

      let listOfUsernames = [];
      getUsernamesLiked.map((each) => {
        listOfUsernames.push(each.username);
      });
      response.send(listOfUsernames);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 8

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const checkUserFollowedQuery = `SELECT *
                                    FROM user Inner Join follower on user.user_id = follower.follower_user_id;`;
    const checkUserFollowed = await db.get(checkUserFollowedQuery);
    if (checkUserFollowed !== undefined) {
      const getUsernameRepliedQuery = `SELECT username,reply
                                        FROM user Inner Join reply AS T1 on user.user_id = T1.user_id
                                        Inner Join tweet AS T2 on T1.user_id = T2.user_id
                                        WHERE T2.tweet_id = ${tweetId}
                                        GROUP BY username;`;
      const getUsernamesReplied = await db.all(getUsernameRepliedQuery);

      let listOfUsernames = [];
      getUsernamesReplied.map((each) => {
        listOfUsernames.push({ username: each.username, reply: each.reply });
      });
      response.send(listOfUsernames);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 9

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const listOfTweetsQuery = `SELECT tweet,COUNT(like_id),COUNT(reply_id),date_time
                                FROM tweet Inner Join like AS T1 on tweet.user_id = T1.user_id
                                Inner Join reply AS T2 on T1.user_id = T2.user_id
                                GROUP BY T2.user_id;`;
  const listOfTweets = await db.all(listOfTweetsQuery);
  response.send(listOfTweets);
});

//API 10

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const createTweetQuery = `INSERT INTO tweet(tweet)
                                VALUES('${tweet}');`;
  const createTweet = await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

//API 11

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
  }
);

module.exports = app;
