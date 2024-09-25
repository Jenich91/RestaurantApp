const { Sequelize, DataTypes } = require('sequelize');

// Подключаемся к базе данных
const sequelize = new Sequelize('postgres', 'postgres', '', {
    host: 'db',
    dialect: 'postgres',
    port: 5432,
    define: {
        timestamps: false,
        freezeTableName: true
    },
});

const models = {};

// Определяем модели
models.User = sequelize.define('User', {
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    role: {
        type: DataTypes.STRING,
        allowNull: false
    },
    orders: {
        type: DataTypes.ARRAY(DataTypes.INTEGER), // Массив id заказов
        allowNull: true
    },
    login: {
        type: DataTypes.STRING,
        allowNull: false
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false
    },
});

models.Order = sequelize.define('Order', {
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false
    },
    items: {
        type: DataTypes.ARRAY(DataTypes.INTEGER), // Массив id пунктов меню
        allowNull: true
    }
});

models.User.associate = models => {
    models.User.hasMany(models.Order, { foreignKey: 'userId' });
};

models.Order.associate = models => {
    models.Order.belongsTo(models.User, { foreignKey: 'userId' });
};

models.MenuItem = sequelize.define('MenuItem', {
    title: {
        type: DataTypes.STRING,
        allowNull: false
    },
    picture: {
        type: DataTypes.STRING,
        allowNull: false
    },
    cost: {
        type: DataTypes.FLOAT,
        allowNull: false
    },
    callQuantity: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: false
    }
});

async function clearAllData() {
    try {
        await sequelize.query('TRUNCATE TABLE "User" RESTART IDENTITY');
        await sequelize.query('TRUNCATE TABLE "Order" RESTART IDENTITY');
        await sequelize.query('TRUNCATE TABLE "MenuItem" RESTART IDENTITY');

        // Удаляем все записи из всех таблиц
        await models.User.destroy({ where: {}, truncate: true });
        await models.Order.destroy({ where: {}, truncate: true });
        await models.MenuItem.destroy({ where: {}, truncate: true });

        console.log('Все данные в базе данных успешно удалены.');
    } catch (error) {
        console.error('Произошла ошибка при очистке данных:', error);
    }
}

// clearAllData();

// Добавление данных
sequelize.sync()
    .then(async () => {
        // Создаем пользователя и заказы
        const user1 = await models.User.create({ name: 'Alice', role: 'waiter', login: 'alice_godless', password: 'imm32obilise' });
        const user2 = await models.User.create({ name: 'Bob', role: 'waiter', login: 'bob_sinner', password: 'at69tractive' });

        const order1 = await models.Order.create({ isActive: true });
        const order2 = await models.Order.create({ isActive: false });

        // Обновляем поле orders у пользователя, добавляя идентификаторы новых заказов
        await user1.update({ orders: sequelize.fn('array_append', sequelize.col('orders'), order1.id) });
        await user2.update({ orders: sequelize.fn('array_append', sequelize.col('orders'), order2.id) });

        // Создаем пункты меню и связываем их с заказами
        const menuItem1 = await models.MenuItem.create({ title: 'Burger', picture: '/images/burger.png', cost: 9.99, callQuantity: 10, description: 'Delicious burger' });
        const menuItem2 = await models.MenuItem.create({ title: 'Salad', picture: '/images/salad.png', cost: 6.99, callQuantity: 15, description: 'Fresh salad' });

        await order1.update({ items: sequelize.fn('array_append', sequelize.col('items'), menuItem1.id) });
        await order1.update({ items: sequelize.fn('array_append', sequelize.col('items'), menuItem2.id) });
        await order2.update({ items: sequelize.fn('array_append', sequelize.col('items'), menuItem1.id) });

        console.log('Данные успешно добавлены в таблицы.');
    })
    .catch((error) => {
        console.error('Ошибка добавления данных:', error);
});

// We export the sequelize connection instance to be used around our app.
// And models too.
module.exports = {sequelize , models};

