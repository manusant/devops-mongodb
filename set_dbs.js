

var DATABASES = [
    "db-service-a",
    "db-service-b",
    "db-service-c"
];

var USER = "{{user_name}}";
var PASSWORD = "{{user_password}}";

function setDb (dbName) {
    print("setting "+dbName);
    db = db.getSiblingDB(dbName);

    try {
        db.createUser(
            {
                user: USER,
                pwd: PASSWORD,
                roles: ["readWrite","dbAdmin"]
            }
        );
    }catch (e) {
        print("Can't create user switch password of it it exists ");
        db.updateUser(
            USER,
            {
                pwd: PASSWORD
            }
        )

    }
    //Stub to make sure db isn't clean when open
    db.createCollection("stub");
}

DATABASES.forEach(setDb);

