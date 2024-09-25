const express = require('express');
const app = express();
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const cookieParser = require('cookie-parser');
const {sequelize} = require('./model/model.js');
const {models} = require('./model/model.js');
const {Op} = require("sequelize");

// Подключаем css
app.use(express.static(__dirname + '/public'));
// Парсим тело запроса как JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(session({
    store: new FileStore(),
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

app.set('view engine', 'hbs');

app.get('/router', function (request, response) {
    response.render('router.hbs');
});

// Функция для получения информации о пользователе
const getUserInfo = async (login) => {
    return await models.User.findOne({
        where: {login},
        raw: true,
        nest: true,
    });
};

// Функция для получения списка блюд заказа
const getMenuItemsData = async (orderId) => {
    const orderInfo = await models.Order.findOne({
        where: {
            id: orderId
        },
        raw: true,
        nest: true,
    });

    let menuItemsData = [];
    for (const menuitemId of orderInfo.items) {
        const menuItem = await models.MenuItem.findOne({
            where: { id: menuitemId },
            raw: true,
            nest: true,
        });

        menuItemsData.push({
            orderId: orderInfo.id,
            isActive: orderInfo.isActive,
            id: menuItem.id,
            title: menuItem.title,
            picture: menuItem.picture,
            cost: menuItem.cost,
            callQuantity: menuItem.callQuantity,
            description: menuItem.description,
        });
    }
    return menuItemsData;
};

// Админ: На главной странице админ видит карточки всех текущих заказов с информацией о составе заказа и официанте, который его обслуживает.
// Официант: На главной странице видит текущий заказ, либо сообщение с призывом идти работать активнее
app.get('/', async function (request, response) {
    if (request.session.user) {
        if (request.session.user.role === 'admin') {
            const waiters = await models.User.findAll({
                where: {
                    role: 'waiter'
                }
            });

            let ordersInfo = [];
            for (const waiter of waiters) {
                const waiterOrderIds = waiter.orders;
                if (Array.isArray(waiterOrderIds)) {
                    for (const waiterOrderId of waiterOrderIds) {
                        const order = await models.Order.findByPk(waiterOrderId);
                        if (order) {
                            const orderItems = await models.MenuItem.findAll({
                                where: {
                                    id: {
                                        [Op.in]: order.items
                                    }
                                }
                            });
                            ordersInfo.push({
                                id: order.id,
                                waiterName: waiter.name,
                                isActive: order.isActive,
                                items: orderItems
                            });
                        }
                    }
                }
            }

            response.render('main_content', { ordersInfo });
        } else {
            const user = await getUserInfo(request.session.user.login);

            if (!user.orders || user.orders.length < 1) {
                const workMotivation=
                    "Вперед - к клиентам, официант,<br>" +
                    "И в этом вся наука:<br>" +
                    "Носить еду туда-сюда,<br>" +
                    "Иди работай, су*а!";

                response.send(workMotivation);
            } else {
                const orderId = user.orders.at(-1);
                const menuItemsData = await getMenuItemsData(orderId);

                let orderPrice = 0;
                for (menuItemData of menuItemsData) {
                    orderPrice = orderPrice + menuItemData.cost;
                }

                response.render('order', { orderId, menuItemsData, orderPrice, noOrder: false });
            }
        }
    }
    else {
        // Если пользователь не аутентифицирован, перенаправить на страницу входа
        response.redirect('/signin');
    }
});

// Пользователь вводит id сотрудника (официанта)
// После ввода на странице появляется список всех заказов, с которыми работал данный сотрудник
app.get('/main_content', async function (request, response) {
    if (!request.body) return response.sendStatus(400);

    const waiterId = request.query.waiterId;

    try {
        const waiter = await models.User.findOne({
            where: {
                id: waiterId,
                role: 'waiter',
            },
        });

        if (!waiter) {
            return response.redirect(404, "back"); // Сотрудник не найден
        }

        const waiterOrders = waiter.dataValues.orders;

        if (!Array.isArray(waiterOrders) || waiterOrders.length === 0) {
            return response.redirect(404, "back"); // У сотрудника нет заказов
        }

        const ordersInfo = [];

        for (const orderId of waiterOrders) {
            const orderInfo = await models.Order.findByPk(orderId);

            if (orderInfo) {
                const menuItems = await models.MenuItem.findAll({
                    where: { id: orderInfo.items }
                });

                const cleanedMenuItems = menuItems.map(item => {
                    return {
                        id: item.id,
                        title: item.title,
                        picture: item.picture,
                        cost: item.cost,
                        description: item.description,
                    };
                });

                ordersInfo.push({
                    id: orderInfo.id,
                    isActive: orderInfo.isActive,
                    orderItems: cleanedMenuItems
                });
            }
        }

        response.render('main_content', { ordersInfo });
    } catch (error) {
        console.error("An error occurred: ", error);
        response.status(500).send("Internal Server Error");
    }
});


// Админ: Не может создавать заказ.
// Официант: На данной странице видит форму для создания нового заказа. Форма состоит из инпута и селекта.
// Инпут задизейблен и в нем введено имя официанта. В селекте можно выбрать блюда для заказа.
app.get('/orders', async function (request, response) {
    if (!request.body) return response.sendStatus(400);

    if (request.session.user && request.session.user.role === 'waiter') {
        //получить список id официантов отображения на форме
        const waiterData = await models.User.findOne({
            where: {
                login: request.session.user.login
            },
            attributes: ['id', 'name'], // Выбираем только name
            raw: true,
            nest: true
        });

        if (!waiterData) { return response.redirect(404, "back"); } // Сотрудник не найден

        //получить список блюд
        const menuItems = await models.MenuItem.findAll({
            attributes: ['title'], // Выбираем только title
            raw: true,
            nest: true,
            order: [['title', 'ASC']]
        });

        // установить id и список блюд в форму на фронте

        const waiterId = waiterData.id;
        const waiterName = waiterData.name;
        response.render('orders', { waiterId, waiterName, menuItems });
    } else {
        // Если пользователь не аутентифицирован, или админ - перенаправить на страницу входа
        response.redirect(403, '/signin');
    }
});

// На данной странице пользователь видит всю информацию о заказе
// В табличном виде перечислены блюда из заказа (вместе с картинками), внизу страницы указана текущая стоимость заказа и кнопка ‘Закрыть заказ’
app.get('/orders/id', async function (request, response) {
    if (!request.body) {
        return response.sendStatus(400); // Если тело запроса отсутствует, отправляем статус "400 Bad Request"
    }

    const waiterId = request.query.waiterId;
    const menuItemTitles = Array.isArray(request.query.menuItemTitle) ? request.query.menuItemTitle : [request.query.menuItemTitle];

    const waiter = await models.User.findOne({
        where: {
            id: waiterId,
            role: 'waiter',
        },
    });

    if (!waiter) {
        return response.status(404).send("Waiter not found"); // Если официант не найден, отправляем статус "404 Not Found"
    }

    const order = await models.Order.create({ isActive: true });

    let menuItemsData = [];
    let orderPrice = 0;

    for (const menuItemTitle of menuItemTitles) {
        const menuItem = await models.MenuItem.findOne({
            where: {
                title: menuItemTitle
            },
            raw: true,
            nest: true,
        });

        menuItemsData.push({
            id: menuItem.id,
            title: menuItem.title,
            picture: menuItem.picture,
            cost: menuItem.cost,
            callQuantity: menuItem.callQuantity,
            description: menuItem.description
        });

        orderPrice += menuItem.cost;

        await order.update({ items: sequelize.fn('array_append', sequelize.col('items'), menuItem.id) });
    }

    await waiter.update({ orders: sequelize.fn('array_append', sequelize.col('orders'), order.id) });

    const orderId = order.id;
    response.render('order', { orderId, menuItemsData, orderPrice }); // Отображение страницы с данными заказа
});

// Закрыть заказ
app.get('/orders/close/:orderId', async function (request, response) {
    const orderId = request.params.orderId;

    try {
        const order = await models.Order.findByPk(orderId);
        if (!order) { return response.redirect(404, "back"); } // Заказ не найден

        await order.update({ isActive:false });

        response.redirect( 200, '/');
    } catch (error) {
        response.status(400).json({ error: error.message });
    }
});

// Данная страница доступна всем типам пользователей
app.get('/menu', async function (request, response) {
    const menuItems = await models.MenuItem.findAll({
        raw: true,
        nest: true,
    });

    let menuItemsData = [];

    for (const menuItem of menuItems) {
        menuItemsData.push(
            {
                data: {
                    id: menuItem.id,
                    title: menuItem.title,
                    picture: menuItem.picture,
                    cost: menuItem.cost,
                    callQuantity: menuItem.callQuantity,
                    description: menuItem.description
                }
            }
        );
    }

    response.render('menu', { menuItemsData });
});

app.get('/signup', function (request, response) {
    response.render('signup.hbs');
});

app.get('/signin', function (request, response) {
    response.render('signin.hbs');
});

// Регистрация
app.post('/register', async(request, response) => {
    const login = request.body.login;
    const password = request.body.password;
    const role= request.body.role;
    await models.User.create({ name: login+"_name", role: role, login: login, password: password });

    response.redirect( '/signin');
});

const isRecordExist = async (login, password) => {
    return await models.User.count({ where: { login:login, password:password } });
};

// Аутентификация
app.post('/login', async (request, response) => {
    const login = request.body.login;
    const password = request.body.password;

    if(!await isRecordExist(login, password)) { return response.redirect(401, "back"); } // Bad login/password

    const user = await models.User.findOne( {
            where: { login:login, password:password },
            raw: true,
            nest: true,
        }
    );

    // После успешной аутентификации сохраняем информацию о пользователе в сессии
    request.session.user = {
        login: login,
        role: user.role
    };

    response.redirect(200, "/"); // You are logged in
});

// Слушаем порт для входящих запросов
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
